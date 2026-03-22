import * as ts from "typescript";

export const isExplicitOpt = (s: string) => s.includes("null") || s.includes("undefined") || s.includes("?") || s.includes("|");

function typeStringIsOptional(tStr: string): boolean {
	return isExplicitOpt(tStr);
}

export function isOriginalOpt(node: ts.Node, checker: ts.TypeChecker): boolean {
	if (ts.isIdentifier(node)) {
		const symbol = checker.getSymbolAtLocation(node);
		if (symbol && symbol.valueDeclaration) {
			const t = checker.getTypeAtLocation(symbol.valueDeclaration);
			const tStr = checker.typeToString(t);
			if (typeStringIsOptional(tStr)) return true;
			const decl = symbol.valueDeclaration;
			if (ts.isParameter(decl)) {
				if (decl.questionToken) return true;
			}
			if (ts.isPropertyDeclaration(decl) || ts.isVariableDeclaration(decl)) {
				if ((decl as any).questionToken) return true;
			}
		}
	}
	const t = checker.getTypeAtLocation(node);
	return typeStringIsOptional(checker.typeToString(t));
}

export function isExpressionOriginallyOptional(node: ts.Expression, checker: ts.TypeChecker): boolean {
	if (ts.isIdentifier(node)) {
		return isOriginalOpt(node, checker);
	}

	if (ts.isPropertyAccessExpression(node)) {
		const symbol = checker.getSymbolAtLocation(node.name);
		const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
		if (decl) {
			const declType = checker.getTypeAtLocation(decl);
			if (typeStringIsOptional(checker.typeToString(declType))) {
				return true;
			}
		}
	}

	const t = checker.getTypeAtLocation(node);
	return typeStringIsOptional(checker.typeToString(t));
}

export function isRecursiveClassDeclaration(classDecl: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
	if (!classDecl.name) return false;
	const className = classDecl.name.text;
	for (const member of classDecl.members) {
		if (!ts.isPropertyDeclaration(member)) continue;
		const memberType = checker.getTypeAtLocation(member);
		const memberTypeStr = checker.typeToString(memberType);
		if (memberTypeStr.includes(className)) {
			return true;
		}
	}
	return false;
}

export function isRecursiveClassType(type: ts.Type, checker: ts.TypeChecker): boolean {
	if (type.isUnion()) {
		return type.types.some((t) => isRecursiveClassType(t, checker));
	}
	const symbol = type.getSymbol();
	if (!symbol || !symbol.declarations) {
		return false;
	}
	const classDecl = symbol.declarations.find(ts.isClassDeclaration);
	if (!classDecl) {
		return false;
	}
	return isRecursiveClassDeclaration(classDecl, checker);
}
