import * as ts from "typescript";
import {
	makeNonShadowingName,
	popIdentifierScope,
	pushIdentifierScope,
	registerIdentifierAlias,
	TranspilerContext,
	Visitor,
} from "../context";
import { translateExpression } from "../expressions";
import { mapType } from "../../types";

export function processClassDeclaration(node: ts.ClassDeclaration, context: TranspilerContext, visit: Visitor) {
	const { checker } = context;
	if (!node.name) return;

	const modFlags = ts.getCombinedModifierFlags(node);
	const isExported = (modFlags & ts.ModifierFlags.Export) !== 0;
	const isDefault = (modFlags & ts.ModifierFlags.Default) !== 0;
	const pub = isExported ? "pub " : "";
	const isGeneric = !!node.typeParameters && node.typeParameters.length > 0;

	if (isGeneric) {
		const tp = node.typeParameters!.map(p => `comptime ${p.name.text}: type`).join(", ");
		context.zigOutput += `${pub}fn ${node.name.text}(${tp}) type {\n`;
		context.zigOutput += `    return struct {\n`;
	} else {
		context.zigOutput += `${pub}const ${node.name.text} = struct {\n`;
	}

	const indent = isGeneric ? "        " : "    ";
	const tpNames = isGeneric ? node.typeParameters!.map(p => p.name.text).join(", ") : "";
	const selfType = isGeneric ? `${node.name.text}(${tpNames})` : node.name.text;

	node.members.forEach(member => {
		if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
			const type = checker.getTypeAtLocation(member);
			const typeStr = checker.typeToString(type);
			const init = member.initializer ? translateExpression(member.initializer, context) : "undefined";
			let mappedType = mapType(typeStr, context.typeAliases);
			const selfTypeName = node.name?.text;
			if (selfTypeName) {
				if (mappedType === selfTypeName || mappedType.startsWith(`${selfTypeName}(`)) {
					mappedType = `*${mappedType}`;
				} else if (mappedType.startsWith(`?${selfTypeName}(`)) {
					mappedType = `?*${mappedType.slice(1)}`;
				}
			}
			context.zigOutput += `${indent}${member.name.text}: ${mappedType} = ${init},\n`;
		}
	});

	node.members.forEach(member => {
		if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
			pushIdentifierScope(context);
			const isStatic = (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) !== 0;
			const signature = checker.getSignatureFromDeclaration(member);
			const returnType = checker.getReturnTypeOfSignature(signature!);
			const returnTypeStr = checker.typeToString(returnType);
			const mutatesSelf = !isStatic && methodMutatesSelf(member);

			const selfParam = isStatic ? "" : `self: *${mutatesSelf ? "" : "const "}${selfType}`;
			const paramNames: Array<{ original: string; emitted: string }> = [];
			const extraParams = member.parameters.map(p => {
				const pName = p.name.getText(context.sourceFile);
				const emittedName = context.globalNames.has(pName) ? makeNonShadowingName(context, pName) : pName;
				registerIdentifierAlias(context, pName, emittedName);
				paramNames.push({ original: pName, emitted: emittedName });
				const pType = checker.getTypeAtLocation(p);
				const pTypeStr = checker.typeToString(pType);
				const isFunctionType = pTypeStr.includes("=>") || pTypeStr.startsWith("(");
				const isOptional = p.questionToken !== undefined;
				const hasNonNullUnion = pTypeStr.includes("|") && !pTypeStr.includes("null") && !pTypeStr.includes("undefined");
				let zigType: string;
				if (isFunctionType || hasNonNullUnion) {
					zigType = "anytype";
				} else if (isOptional) {
					zigType = "?" + mapType(pTypeStr.replace(" | undefined", "").replace(" | null", "").trim(), context.typeAliases);
				} else {
					zigType = mapType(pTypeStr, context.typeAliases);
				}
				return `${emittedName}: ${zigType}`;
			}).join(", ");
			const allParams = [selfParam, extraParams].filter(Boolean).join(", ");
			context.zigOutput += `${indent}pub fn ${member.name.text}(${allParams}) ${mapType(returnTypeStr, context.typeAliases)} {\n`;
			if (member.body && member.body.statements.length > 0) {
				const originalMain = context.mainBody;
				context.mainBody = "";
				member.body.statements.forEach(stmt => visit(stmt));
				let bodyStr = context.mainBody;

				// Discard unused 'self'
				if (!isStatic && !bodyStr.match(/\bthis\./) && !bodyStr.match(/\bself\./)) {
					bodyStr = `    _ = self;\n` + bodyStr;
				}

				// Discard unused explicit params
				paramNames.forEach(({ emitted }) => {
					if (!new RegExp(`\\b${emitted}\\b`).test(bodyStr)) {
						bodyStr = `    _ = ${emitted};\n` + bodyStr;
					}
				});

				const body = bodyStr.replace(/\bthis\./g, isStatic ? `${selfType}.` : "self.").split("\n").filter(l => l.trim()).map(l => indent + "    " + l).join("\n");
				context.zigOutput += body + "\n";
				context.mainBody = originalMain;
			} else if (!isStatic) {
				context.zigOutput += `${indent}    _ = self;\n`;
			}
			context.zigOutput += `${indent}}\n`;
			popIdentifierScope(context);
		}
	});

	if (isGeneric) {
		context.zigOutput += `    };\n}\n\n`;
	} else {
		context.zigOutput += `};\n\n`;
	}

	if (isDefault) {
		context.zigOutput += `pub const Default = ${node.name.text};\n\n`;
	}
}

function methodMutatesSelf(member: ts.MethodDeclaration): boolean {
	if (!member.body) return false;
	let mutates = false;

	const visitNode = (n: ts.Node) => {
		if (mutates) return;

		if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
			const methodName = n.expression.name.text;
			if (
				isAccessOnThis(n.expression.expression)
				&& (methodName === "set" || methodName === "push" || methodName === "add" || methodName === "insert" || methodName === "delete")
			) {
				mutates = true;
				return;
			}
		}

		if (ts.isBinaryExpression(n) && isMutationOperator(n.operatorToken.kind)) {
			if (isAccessOnThis(n.left)) {
				mutates = true;
				return;
			}
		}

		if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && isAccessOnThis(n.operand)) {
			if (
				n.operator === ts.SyntaxKind.PlusPlusToken
				|| n.operator === ts.SyntaxKind.MinusMinusToken
			) {
				mutates = true;
				return;
			}
		}

		ts.forEachChild(n, visitNode);
	};

	visitNode(member.body);
	return mutates;
}

function isAccessOnThis(node: ts.Node): boolean {
	if (ts.isPropertyAccessExpression(node)) {
		if (node.expression.kind === ts.SyntaxKind.ThisKeyword) return true;
		return isAccessOnThis(node.expression);
	}
	if (ts.isElementAccessExpression(node)) {
		if (node.expression.kind === ts.SyntaxKind.ThisKeyword) return true;
		return isAccessOnThis(node.expression);
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
