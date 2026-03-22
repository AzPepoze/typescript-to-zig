import * as ts from "typescript";
import { popIdentifierScope, pushIdentifierScope, TranspilerContext, Visitor } from "../context";

export function processBlock(node: ts.Block, context: TranspilerContext, visit: Visitor) {
	pushIdentifierScope(context);
	node.statements.forEach((statement: ts.Statement) => visit(statement));
	popIdentifierScope(context);
}