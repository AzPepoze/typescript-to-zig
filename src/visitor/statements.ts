import * as ts from "typescript";
import { makeNonShadowingName, registerIdentifierAlias, TranspilerContext, Visitor } from "./context";
import { translateExpression } from "./expressions";
import { emitConsolePrint } from "./mappings/console";
import { mapType, normalizeLiteralType } from "../types";
import { isExpressionOriginallyOptional, isRecursiveClassType } from "./utils";

const MUTATING_METHODS = new Set(["push", "set", "add", "insert", "delete"]);

function isOptionalTypeString(typeStr: string): boolean {
	return typeStr.includes("null") || typeStr.includes("undefined") || typeStr.startsWith("?") || typeStr.includes("|");
}

function isAnyLikeType(typeStr: string): boolean {
	return typeStr === "any" || typeStr === "unknown";
}

export function processVariableStatement(node: ts.VariableStatement, context: TranspilerContext, visit: Visitor) {
	const { sourceFile, checker } = context;
	node.declarationList.declarations.forEach((declaration: ts.VariableDeclaration) => {
		if (!ts.isIdentifier(declaration.name)) return;
		const originalName = declaration.name.text;

		if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
			processFunctionVariable(declaration, node, context, visit);
			return;
		}

		const type = checker.getTypeAtLocation(declaration);
		const typeStr = checker.typeToString(type);
		const rawZigType = mapType(typeStr, context.typeAliases);
		let zigType = normalizeLiteralType(rawZigType);
		if (isRecursiveClassType(type, checker)) {
			if (zigType.startsWith("?")) {
				zigType = `?*${zigType.slice(1)}`;
			} else if (!zigType.startsWith("*")) {
				zigType = `*${zigType}`;
			}
		}
		const isGlobal = node.parent === sourceFile;
		const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
		const isMutated = isVariableMutatedAfterDeclaration(node, originalName);
		const isNew = !!(declaration.initializer && ts.isNewExpression(declaration.initializer));
		const isCompileTimeInit = !!declaration.initializer && (
			ts.isLiteralExpression(declaration.initializer)
			|| ts.isNoSubstitutionTemplateLiteral(declaration.initializer)
			|| ts.isArrayLiteralExpression(declaration.initializer)
			|| ts.isObjectLiteralExpression(declaration.initializer)
		);

		let emittedName = originalName;
		if (isGlobal) {
			context.globalNames.add(originalName);
		} else if (context.globalNames.has(originalName)) {
			emittedName = makeNonShadowingName(context, originalName);
		}

		const keyword = isGlobal
			? (isConst && isCompileTimeInit && !isNew && !zigType.startsWith("[]") ? "const" : "var")
			: (isConst && (!zigType.startsWith("[]") || !isMutated) ? "const" : "var");

		const typeAnnotation = zigType === "anytype" ? "" : `: ${zigType}`;
		let initText = declaration.initializer ? translateExpression(declaration.initializer, context) : "undefined";
		const declarationIsOptional = isOptionalTypeString(typeStr);
		if (
			declaration.initializer
			&& !declarationIsOptional
			&& isExpressionOriginallyOptional(declaration.initializer, checker)
			&& !initText.endsWith(".?")
		) {
			initText = `${initText}.?`;
		}

		if (!isGlobal && emittedName !== originalName) {
			registerIdentifierAlias(context, originalName, emittedName);
		}

		if (isGlobal) {
			if (keyword === "var" && declaration.initializer && !isCompileTimeInit) {
				context.zigOutput += `pub var ${emittedName}${typeAnnotation} = undefined;\n`;
				context.mainBody += `    ${emittedName} = ${initText};\n`;
			} else {
				context.zigOutput += `pub ${keyword} ${emittedName}${typeAnnotation} = ${initText};\n`;
			}
		} else {
			context.mainBody += `    ${keyword} ${emittedName}${typeAnnotation} = ${initText};\n`;
		}
	});
}

function isVariableMutatedAfterDeclaration(node: ts.VariableStatement, variableName: string): boolean {
	const parent = node.parent;
	if (!parent || !("statements" in parent)) return false;
	const statements = (parent as ts.Block | ts.SourceFile).statements;
	const start = statements.findIndex((s) => s === node);
	if (start < 0) return false;

	const isMutatingNode = (n: ts.Node): boolean => {
		if (ts.isBinaryExpression(n) && isMutationOperator(n.operatorToken.kind)) {
			if (ts.isIdentifier(n.left) && n.left.text === variableName) return true;
		}

		if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) {
			if ((n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && ts.isIdentifier(n.operand) && n.operand.text === variableName) {
				return true;
			}
		}

		if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
			const target = n.expression.expression;
			const method = n.expression.name.text;
			if (
				ts.isIdentifier(target)
				&& target.text === variableName
				&& MUTATING_METHODS.has(method)
			) {
				return true;
			}
		}

		let found = false;
		ts.forEachChild(n, (c) => {
			if (!found && isMutatingNode(c)) {
				found = true;
			}
		});
		return found;
	};

	for (let i = start + 1; i < statements.length; i++) {
		if (isMutatingNode(statements[i])) {
			return true;
		}
	}

	return false;
}

function isMutationOperator(kind: ts.SyntaxKind): boolean {
	return kind === ts.SyntaxKind.EqualsToken
		|| kind === ts.SyntaxKind.PlusEqualsToken
		|| kind === ts.SyntaxKind.MinusEqualsToken
		|| kind === ts.SyntaxKind.AsteriskEqualsToken
		|| kind === ts.SyntaxKind.SlashEqualsToken
		|| kind === ts.SyntaxKind.PercentEqualsToken;
}

function processFunctionVariable(
	declaration: ts.VariableDeclaration,
	node: ts.VariableStatement,
	context: TranspilerContext,
	visit: Visitor
) {
	const { checker, sourceFile } = context;
	const functionDeclaration = declaration.initializer as ts.ArrowFunction | ts.FunctionExpression;
	const signature = checker.getSignatureFromDeclaration(functionDeclaration);
	const returnType = signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)) : "void";
	const params = functionDeclaration.parameters.map((parameter: ts.ParameterDeclaration) => {
		const parameterType = checker.typeToString(checker.getTypeAtLocation(parameter));
		return `${parameter.name.getText(sourceFile)}: ${mapType(parameterType, context.typeAliases)}`;
	}).join(", ");

	const hasExportModifier = node.modifiers?.some((modifier: ts.ModifierLike) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
	const pub = hasExportModifier || node.parent === context.sourceFile ? "pub " : "";

	context.zigOutput += `${pub}fn ${(declaration.name as ts.Identifier).text}(${params}) ${mapType(returnType, context.typeAliases)} {\n`;

	if (ts.isBlock(functionDeclaration.body)) {
		const originalMain = context.mainBody;
		context.mainBody = "";
		functionDeclaration.body.statements.forEach((statement: ts.Statement) => {
			if (context.mainBody.endsWith("// unreachable\n") || context.mainBody.endsWith("/* unreachable */\n")) return;
			visit(statement);
		});
		const body = context.mainBody.split("\n").filter(line => line.trim()).map(line => "    " + line.trim()).join("\n");
		context.zigOutput += body + "\n";
		context.mainBody = originalMain;
	} else {
		const bodyExpr = translateExpression(functionDeclaration.body as ts.Expression, context);
		context.zigOutput += `    return ${bodyExpr};\n`;
	}

	context.zigOutput += "}\n\n";
}

export function processExpressionStatement(node: ts.ExpressionStatement, context: TranspilerContext) {
	const { checker } = context;
	const expression = node.expression;

	if (
		ts.isBinaryExpression(expression)
		&& expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
		&& ts.isArrayLiteralExpression(expression.left)
		&& ts.isArrayLiteralExpression(expression.right)
		&& expression.left.elements.length === 2
		&& expression.right.elements.length === 2
	) {
		const left0 = translateExpression(expression.left.elements[0], context);
		const left1 = translateExpression(expression.left.elements[1], context);
		const right0 = translateExpression(expression.right.elements[0], context);
		const right1 = translateExpression(expression.right.elements[1], context);
		context.mainBody += `    const __destructure_tmp0 = ${right0};\n`;
		context.mainBody += `    const __destructure_tmp1 = ${right1};\n`;
		context.mainBody += `    ${left0} = __destructure_tmp0;\n`;
		context.mainBody += `    ${left1} = __destructure_tmp1;\n`;
		return;
	}

	if (
		ts.isBinaryExpression(expression)
		&& expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
		&& ts.isPropertyAccessExpression(expression.left)
	) {
		const baseType = checker.getTypeAtLocation(expression.left.expression);
		const baseTypeStr = checker.typeToString(baseType);
		if (isAnyLikeType(baseTypeStr)) {
			return;
		}
	}

	if (ts.isCallExpression(expression)) {
		if (ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "push") {
			const targetNode = expression.expression.expression;
			const targetExpr = translateExpression(targetNode, context);
			const valueExpr = expression.arguments[0] ? translateExpression(expression.arguments[0], context) : "undefined";
			const targetType = checker.getTypeAtLocation(expression.expression.expression);
			const targetTypeStr = checker.typeToString(targetType);
			const elemTsType = targetTypeStr.endsWith("[]") ? targetTypeStr.slice(0, -2) : "any";
			const elemZigType = mapType(elemTsType, context.typeAliases);
			context.mainBody += `    ${targetExpr} = __slicePush(${elemZigType}, ${targetExpr}, ${valueExpr});\n`;

			if (ts.isIdentifier(targetNode)) {
				const symbol = checker.getSymbolAtLocation(targetNode);
				const decl = symbol?.valueDeclaration;
				const getCall = decl && ts.isVariableDeclaration(decl) && decl.initializer
					? getMapGetCall(decl.initializer)
					: null;
				if (getCall && getCall.arguments.length > 0) {
					const getTarget = getCall.expression as ts.PropertyAccessExpression;
					const mapExpr = translateExpression(getTarget.expression, context);
					const keyExpr = translateExpression(getCall.arguments[0], context);
					context.mainBody += `    _ = ${mapExpr}.set(${keyExpr}, ${targetExpr});\n`;
				}
			}
			return;
		}

		const callText = expression.expression.getText(context.sourceFile);
		if (callText === "console.log") {
			emitConsolePrint(expression.arguments, context);
			return;
		}
		const callExpression = translateExpression(expression, context);
		const returnTypeInner = checker.getTypeAtLocation(expression);
		const returnTypeStrInner = checker.typeToString(returnTypeInner);
		if (returnTypeStrInner !== "void") {
			context.mainBody += `    _ = ${callExpression};\n`;
		} else {
			context.mainBody += `    ${callExpression};\n`;
		}
		return;
	}

	context.mainBody += `    ${translateExpression(expression, context)};\n`;
}

function getMapGetCall(expr: ts.Expression): ts.CallExpression | null {
	let current: ts.Expression = expr;
	while (
		ts.isNonNullExpression(current)
		|| ts.isParenthesizedExpression(current)
		|| ts.isAsExpression(current)
		|| ts.isTypeAssertionExpression(current)
	) {
		current = current.expression;
	}
	if (!ts.isCallExpression(current) || !ts.isPropertyAccessExpression(current.expression)) {
		return null;
	}
	if (current.expression.name.text !== "get") {
		return null;
	}
	return current;
}

export function processReturnStatement(node: ts.ReturnStatement, context: TranspilerContext) {
	const value = node.expression ? translateExpression(node.expression, context) : "";
	context.mainBody += `    return ${value};\n`;
}

export function processThrowStatement(_: ts.ThrowStatement, context: TranspilerContext) {
	if (context.catchBlockBody) {
		context.mainBody += `    { const err = error.RuntimeError; _ = err; ${context.catchBlockBody} }\n`;
	} else {
		context.mainBody += `    return error.RuntimeError;\n`;
	}
}

export function processTryStatement(node: ts.TryStatement, context: TranspilerContext, visit: Visitor) {
	if (node.finallyBlock) {
		context.mainBody += "    defer {\n";
		const originalMainFinally = context.mainBody;
		context.mainBody = "";
		node.finallyBlock.statements.forEach((statement: ts.Statement) => visit(statement));
		const bodyLines = context.mainBody.split("\n").filter(line => line.trim());
		const bodyFinally = bodyLines.map(line => "        " + line.trim()).join("\n");
		context.mainBody = originalMainFinally + bodyFinally + "\n    }\n";
	}

	if (node.catchClause) {
		const catchVariableName = node.catchClause.variableDeclaration && ts.isIdentifier(node.catchClause.variableDeclaration.name)
			? node.catchClause.variableDeclaration.name.text
			: undefined;

		const originalMainCapture = context.mainBody;
		context.mainBody = "";
		node.catchClause.block.statements.forEach((statement: ts.Statement) => visit(statement));
		const catchBody = context.mainBody.trim().replace(/\n\s+/g, " ").replace(/\/\* unreachable \*\//g, "").replace(/\/\/ unreachable/g, "");
		context.mainBody = originalMainCapture;

		const previousCatch = context.catchBlockBody;
		const previousCatchVar = context.catchVarName;
		context.catchBlockBody = catchBody;
		context.catchVarName = catchVariableName;

		node.tryBlock.statements.forEach((statement: ts.Statement) => {
			visit(statement);
		});

		context.catchBlockBody = previousCatch;
		context.catchVarName = previousCatchVar;
	} else {
		node.tryBlock.statements.forEach((statement: ts.Statement) => {
			visit(statement);
		});
	}
}
