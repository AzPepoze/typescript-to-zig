import * as ts from "typescript";
import { makeNonShadowingName, registerIdentifierAlias, TranspilerContext, Visitor } from "./context";
import { translateExpression } from "./expressions";
import { emitConsolePrint } from "./mappings/console";
import { mapType, normalizeLiteralType } from "../types";

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
		const zigType = normalizeLiteralType(rawZigType);
		const isGlobal = node.parent === sourceFile;
		const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
		const isNew = !!(declaration.initializer && ts.isNewExpression(declaration.initializer));

		let emittedName = originalName;
		if (isGlobal) {
			context.globalNames.add(originalName);
		} else if (context.globalNames.has(originalName)) {
			emittedName = makeNonShadowingName(context, originalName);
		}

		const keyword = isGlobal
			? (isNew ? "var" : (isConst ? "const" : "var"))
			: (isConst ? "const" : "var");

		const typeAnnotation = zigType === "anytype" ? "" : `: ${zigType}`;
		const initText = declaration.initializer ? translateExpression(declaration.initializer, context) : "undefined";

		if (!isGlobal && emittedName !== originalName) {
			registerIdentifierAlias(context, originalName, emittedName);
		}

		if (isGlobal) {
			context.zigOutput += `pub ${keyword} ${emittedName}${typeAnnotation} = ${initText};\n`;
		} else {
			context.mainBody += `    ${keyword} ${emittedName}${typeAnnotation} = ${initText};\n`;
		}
	});
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

	if (ts.isCallExpression(expression)) {
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
