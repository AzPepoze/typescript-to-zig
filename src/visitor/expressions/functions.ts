import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { mapType } from "../../types";

export function translateArrowFunctionExpression(node: ts.ArrowFunction, context: TranspilerContext): string {
	const { checker, sourceFile } = context;
	const signature = checker.getSignatureFromDeclaration(node);
	const returnType = signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)) : "anytype";
	const params = node.parameters.map(p => {
		const pType = checker.typeToString(checker.getTypeAtLocation(p));
		return `${p.name.getText(sourceFile)}: ${mapType(pType, context.typeAliases)}`;
	}).join(", ");
	return `fn(${params}) ${mapType(returnType, context.typeAliases)}`;
}
