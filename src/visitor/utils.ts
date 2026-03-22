import * as ts from "typescript";

export const isExplicitOpt = (s: string) => s.includes("null") || s.includes("undefined") || s.includes("?") || s.includes("|");

export function isOriginalOpt(node: ts.Node, checker: ts.TypeChecker): boolean {
	if (ts.isIdentifier(node)) {
		const symbol = checker.getSymbolAtLocation(node);
		if (symbol && symbol.valueDeclaration) {
			const t = checker.getTypeAtLocation(symbol.valueDeclaration);
			const tStr = checker.typeToString(t);
			if (isExplicitOpt(tStr)) return true;
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
	return isExplicitOpt(checker.typeToString(t));
}
