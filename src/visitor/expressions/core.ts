import * as ts from "typescript";
import { resolveIdentifierName, TranspilerContext } from "../context";
import { translateTemplateLiteral } from "./literals";
import { translateBinaryExpression } from "./binary";
import { translateCallExpression, translateNewExpression } from "./calls";
import { translateArrowFunctionExpression } from "./functions";
import { mapType } from "../../types";

export function translateExpression(node: ts.Node, context: TranspilerContext): string {
	const { sourceFile, checker } = context;

	if (ts.isIdentifier(node)) {
		const text = node.text;
		if (text === "undefined") return "null";
		return resolveIdentifierName(context, text);
	}

	if (ts.isNumericLiteral(node)) return node.text;
	if (ts.isStringLiteral(node)) return `"${node.text}"`;
	if (ts.isBigIntLiteral(node)) return node.text.replace(/n$/, "");
	if (ts.isNoSubstitutionTemplateLiteral(node)) return `"${node.text}"`;
	if (ts.isTemplateExpression(node)) return translateTemplateLiteral(node, context);

	if (ts.isArrayLiteralExpression(node)) {
		const elements = node.elements.map((element: ts.Expression) => translateExpression(element, context));
		const contextualType = checker.getContextualType(node);
		const typeStr = contextualType ? checker.typeToString(contextualType) : "";
		const isSlice = typeStr.includes("[]") || typeStr.includes("Array");
		if (isSlice) {
			const zigSliceType = mapType(typeStr, context.typeAliases);
			const elemType = zigSliceType.startsWith("[]") ? zigSliceType.slice(2) : "anytype";
			return `@constCast(&[_]${elemType}{ ${elements.join(", ")} })`;
		}
		return `.{ ${elements.join(", ")} }`;
	}

	if (ts.isObjectLiteralExpression(node)) {
		const properties = node.properties.map((property: ts.ObjectLiteralElementLike) => {
			if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
				return `.${property.name.text} = ${translateExpression(property.initializer, context)}`;
			}
			if (ts.isShorthandPropertyAssignment(property) && ts.isIdentifier(property.name)) {
				return `.${property.name.text} = ${property.name.text}`;
			}
			return "";
		}).filter(Boolean).join(", ");
		return `.{ ${properties} }`;
	}

	if (ts.isPropertyAccessExpression(node)) {
		const object = translateExpression(node.expression, context);
		const propertyName = node.name.text;
		if (object === "this") return `self.${propertyName}`;
		return `${object}.${propertyName}`;
	}

	if (ts.isElementAccessExpression(node)) {
		const object = translateExpression(node.expression, context);
		const index = translateExpression(node.argumentExpression, context);
		const indexType = context.checker.getTypeAtLocation(node.argumentExpression);
		const indexTypeStr = context.checker.typeToString(indexType);
		if (indexTypeStr.includes("number")) {
			return `${object}[@as(usize, @intFromFloat(${index}))]`;
		}
		return `${object}[${index}]`;
	}

	if (ts.isTypeOfExpression(node)) {
		return `@typeName(@TypeOf(${translateExpression(node.expression, context)}))`;
	}

	if (ts.isBinaryExpression(node)) return translateBinaryExpression(node, context);

	if (ts.isNonNullExpression(node)) {
		return translateExpression(node.expression, context);
	}

	if (ts.isPrefixUnaryExpression(node)) {
		const operand = translateExpression(node.operand, context);
		const opMap: Partial<Record<ts.PrefixUnaryOperator, string>> = {
			[ts.SyntaxKind.ExclamationToken]: "!",
			[ts.SyntaxKind.MinusToken]: "-",
			[ts.SyntaxKind.PlusToken]: "+",
			[ts.SyntaxKind.TildeToken]: "~",
		};
		return `${opMap[node.operator] ?? ""}${operand}`;
	}

	if (ts.isPostfixUnaryExpression(node)) {
		const operand = translateExpression(node.operand, context);
		if (node.operator === ts.SyntaxKind.PlusPlusToken) return `${operand} += 1`;
		if (node.operator === ts.SyntaxKind.MinusMinusToken) return `${operand} -= 1`;
		return operand;
	}

	if (ts.isCallExpression(node)) return translateCallExpression(node, context);
	if (ts.isNewExpression(node)) return translateNewExpression(node, context);
	if (ts.isArrowFunction(node)) return translateArrowFunctionExpression(node, context);
	if (ts.isParenthesizedExpression(node)) return `(${translateExpression(node.expression, context)})`;

	if (ts.isConditionalExpression(node)) {
		const cond = translateExpression(node.condition, context);
		const whenTrue = translateExpression(node.whenTrue, context);
		const whenFalse = translateExpression(node.whenFalse, context);
		return `if (${cond}) ${whenTrue} else ${whenFalse}`;
	}

	let text = node.getText(sourceFile);
	if (text === "null" || text === "undefined") return "null";
	text = text.replace(/ === /g, " == ");
	text = text.replace(/ !== /g, " != ");
	text = text.replace(/(\d+)n\b/g, "$1");
	text = text.replace(/\bthis\./g, "self.");
	return text;
}
