import * as ts from "typescript";
import { TranspilerContext, Visitor } from "../context";
import { translateExpression } from "../expressions";

export function processIfStatement(node: ts.IfStatement, context: TranspilerContext, visit: Visitor) {
	const cond = translateExpression(node.expression, context);
	const type = context.checker.getTypeAtLocation(node.expression);
	const typeStr = context.checker.typeToString(type);
	const isOptional = typeStr.includes("undefined") || typeStr.includes("null") || typeStr.startsWith("?");

	let zigCond = cond;
	if (isOptional && !cond.includes("!=") && !cond.includes("==")) {
		zigCond = `${cond} != null`;
	}

	const isComptime = cond.includes("@TypeOf") || cond.includes("comptime");
	const ifCond = isComptime ? `comptime ${zigCond}` : zigCond;

	context.mainBody += `    if (${ifCond}) {\n`;
	const originalMain = context.mainBody;
	context.mainBody = "";
	visit(node.thenStatement);
	const thenBody = context.mainBody.split("\n").filter(l => l.trim()).map(l => "        " + l.trim()).join("\n");
	context.mainBody = originalMain + thenBody + "\n    }";

	if (node.elseStatement) {
		context.mainBody += " else ";
		if (ts.isIfStatement(node.elseStatement)) {
			processIfStatement(node.elseStatement, context, visit);
		} else {
			context.mainBody += "{\n";
			const originalMainElse = context.mainBody;
			context.mainBody = "";
			visit(node.elseStatement);
			const elseBody = context.mainBody.split("\n").filter(l => l.trim()).map(l => "        " + l.trim()).join("\n");
			context.mainBody = originalMainElse + elseBody + "\n    }\n";
		}
	} else {
		context.mainBody += "\n";
	}
}
