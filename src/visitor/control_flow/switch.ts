import * as ts from "typescript";
import { TranspilerContext, Visitor } from "../context";
import { translateExpression } from "../expressions";

export function processSwitchStatement(node: ts.SwitchStatement, context: TranspilerContext, visit: Visitor) {
	const { checker } = context;
	const expr = translateExpression(node.expression, context);
	const type = checker.getTypeAtLocation(node.expression);
	const typeStr = checker.typeToString(type);
	const isString = typeStr.includes("string") || typeStr.includes('"') || typeStr.includes("'");

	if (isString) {
		node.caseBlock.clauses.forEach((clause, index) => {
			if (ts.isCaseClause(clause)) {
				const caseExpr = translateExpression(clause.expression, context);
				const prefix = index === 0 ? "if" : "} else if";
				context.mainBody += `    ${prefix} (std.mem.eql(u8, ${expr}, ${caseExpr})) {\n`;
			} else {
				context.mainBody += `    } else {\n`;
			}
			const originalMain = context.mainBody;
			context.mainBody = "";
			clause.statements.forEach(s => visit(s));
			const bodyLines = context.mainBody.split("\n").filter(l => l.trim());
			const body = bodyLines.map(l => "        " + l.trim()).join("\n");
			context.mainBody = originalMain + (body ? body + "\n" : "");
			if (index === node.caseBlock.clauses.length - 1) {
				context.mainBody += "    }\n";
			}
		});
		return;
	}

	context.mainBody += `    switch (${expr}) {\n`;
	node.caseBlock.clauses.forEach(clause => {
		if (ts.isCaseClause(clause)) {
			const caseExpr = translateExpression(clause.expression, context);
			context.mainBody += `        ${caseExpr} => {\n`;
		} else {
			context.mainBody += `        else => {\n`;
		}
		const originalMain = context.mainBody;
		context.mainBody = "";
		clause.statements.forEach(s => visit(s));
		const body = context.mainBody.split("\n").filter(l => l.trim()).map(l => "            " + l.trim()).join("\n");
		context.mainBody = originalMain + body + "\n        },\n";
	});
	context.mainBody += `    }\n`;
}
