import * as ts from "typescript";
import { TranspilerContext, Visitor } from "../context";
import { translateExpression } from "../expressions";
import { isExpressionOriginallyOptional } from "../utils";

export function processForStatement(node: ts.ForStatement, context: TranspilerContext, visit: Visitor) {
	if (node.initializer && ts.isVariableDeclarationList(node.initializer)) {
		node.initializer.declarations.forEach(decl => {
			const init = decl.initializer ? translateExpression(decl.initializer, context) : "0";
			context.mainBody += `    var ${decl.name.getText()}: f64 = ${init};\n`;
		});
	}
	const cond = node.condition ? translateExpression(node.condition, context) : "true";
	context.mainBody += `    while (${cond}) {\n`;
	const originalMain = context.mainBody;
	context.mainBody = "";
	visit(node.statement);
	if (node.incrementor) {
		context.mainBody += `    ${translateExpression(node.incrementor, context)};\n`;
	}
	const body = context.mainBody.split("\n").filter(l => l.trim()).map(l => "        " + l.trim()).join("\n");
	context.mainBody = originalMain + body + "\n    }\n";
}

export function processWhileStatement(node: ts.WhileStatement, context: TranspilerContext, visit: Visitor) {
	const cond = translateExpression(node.expression, context);
	context.mainBody += `    while (${cond}) {\n`;
	const originalMain = context.mainBody;
	context.mainBody = "";
	visit(node.statement);
	const body = context.mainBody.split("\n").filter(l => l.trim()).map(l => "        " + l.trim()).join("\n");
	context.mainBody = originalMain + body + "\n    }\n";
}

export function processDoStatement(node: ts.DoStatement, context: TranspilerContext, visit: Visitor) {
	context.mainBody += `    while (true) {\n`;
	const originalMain = context.mainBody;
	context.mainBody = "";
	visit(node.statement);
	const cond = translateExpression(node.expression, context);
	context.mainBody += `    if (!(${cond})) break;\n`;
	const body = context.mainBody.split("\n").filter(l => l.trim()).map(l => "        " + l.trim()).join("\n");
	context.mainBody = originalMain + body + "\n    }\n";
}

export function processForOfStatement(node: ts.ForOfStatement, context: TranspilerContext, visit: Visitor) {
	const { checker } = context;
	const expression = translateExpression(node.expression, context);
	const expressionType = checker.getTypeAtLocation(node.expression);
	const expressionTypeStr = checker.typeToString(expressionType);
	const isOptional = expressionTypeStr.includes("null") || expressionTypeStr.includes("undefined") || expressionTypeStr.startsWith("?") || expressionTypeStr.includes("|") || isExpressionOriginallyOptional(node.expression, checker);
	let varName = "item";
	if (ts.isVariableDeclarationList(node.initializer)) {
		varName = node.initializer.declarations[0].name.getText();
	}
	if (isOptional) {
		context.mainBody += `    if (${expression}) |__for_of_iter| {\n`;
		context.mainBody += `        for (__for_of_iter) |${varName}| {\n`;
	} else {
		context.mainBody += `    for (${expression}) |${varName}| {\n`;
	}
	const originalMain = context.mainBody;
	context.mainBody = "";
	visit(node.statement);
	const bodyIndent = isOptional ? "            " : "        ";
	const body = context.mainBody.split("\n").filter(l => l.trim()).map(l => bodyIndent + l.trim()).join("\n");
	if (isOptional) {
		context.mainBody = originalMain + body + "\n        }\n    }\n";
	} else {
		context.mainBody = originalMain + body + "\n    }\n";
	}
}
