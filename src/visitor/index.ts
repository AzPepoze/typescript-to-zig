import * as ts from "typescript";
import { TranspilerContext, Visitor } from "./context";
import {
	processVariableStatement,
	processExpressionStatement,
	processReturnStatement,
	processThrowStatement,
	processTryStatement,
} from "./statements";
import {
	processFunctionDeclaration,
	processInterfaceDeclaration,
	processClassDeclaration,
	processEnumDeclaration,
	processImportDeclaration,
	processTypeAliasDeclaration
} from "./declarations";
import {
	processIfStatement,
	processBlock,
	processForStatement,
	processWhileStatement,
	processSwitchStatement,
	processDoStatement,
	processForOfStatement,
} from "./control_flow";

export function createVisitor(context: TranspilerContext): Visitor {
	const visit: Visitor = (node: ts.Node) => {
		// logger.debug(`Visiting node: ${ts.SyntaxKind[node.kind]}`);
		if (ts.isVariableStatement(node)) {
			processVariableStatement(node, context, visit);
		} else if (ts.isFunctionDeclaration(node)) {
			processFunctionDeclaration(node, context, visit);
		} else if (ts.isExpressionStatement(node)) {
			processExpressionStatement(node, context);
		} else if (ts.isIfStatement(node)) {
			processIfStatement(node, context, visit);
		} else if (ts.isBlock(node)) {
			processBlock(node, context, visit);
		} else if (ts.isForStatement(node)) {
			processForStatement(node, context, visit);
		} else if (ts.isWhileStatement(node)) {
			processWhileStatement(node, context, visit);
		} else if (ts.isReturnStatement(node)) {
			processReturnStatement(node, context);
		} else if (ts.isSwitchStatement(node)) {
			processSwitchStatement(node, context, visit);
		} else if (ts.isDoStatement(node)) {
			processDoStatement(node, context, visit);
		} else if (ts.isForOfStatement(node)) {
			processForOfStatement(node, context, visit);
		} else if (ts.isThrowStatement(node)) {
			processThrowStatement(node, context);
		} else if (ts.isTryStatement(node)) {
			processTryStatement(node, context, visit);
		} else if (ts.isInterfaceDeclaration(node)) {
			processInterfaceDeclaration(node, context);
		} else if (ts.isClassDeclaration(node)) {
			processClassDeclaration(node, context, visit);
		} else if (ts.isEnumDeclaration(node)) {
			processEnumDeclaration(node, context);
		} else if (ts.isImportDeclaration(node)) {
			processImportDeclaration(node, context);
		} else if (ts.isTypeAliasDeclaration(node)) {
			processTypeAliasDeclaration(node, context);
		}
	};

	return visit;
}
