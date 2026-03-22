import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { getFormatSpecifier, translateExpression } from "../expressions";

export function emitConsolePrint(args: ts.NodeArray<ts.Expression>, context: TranspilerContext) {
	const { checker } = context;
	const fmtParts: string[] = [];
	const callArgs: string[] = [];

	args.forEach((arg, index) => {
		if (index > 0) fmtParts.push(" ");

		if (ts.isTemplateExpression(arg)) {
			fmtParts.push(arg.head.text);
			arg.templateSpans.forEach(span => {
				fmtParts.push(getFormatSpecifier(span.expression, checker));
				callArgs.push(translateExpression(span.expression, context));
				fmtParts.push(span.literal.text);
			});
		} else if (ts.isNoSubstitutionTemplateLiteral(arg)) {
			fmtParts.push(arg.text);
		} else {
			const specifier = getFormatSpecifier(arg, checker);
			fmtParts.push(specifier);
			callArgs.push(translateExpression(arg, context));
		}
	});

	const fmtString = fmtParts.join("") + "\\n";
	const argList = callArgs.length > 0 ? callArgs.join(", ") : "";
	const dotArgs = callArgs.length > 0 ? `.{ ${argList} }` : ".{}";
	context.mainBody += `    std.debug.print("${fmtString}", ${dotArgs});\n`;
}
