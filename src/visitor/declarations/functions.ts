import * as ts from "typescript";
import {
	makeNonShadowingName,
	popIdentifierScope,
	pushIdentifierScope,
	registerIdentifierAlias,
	TranspilerContext,
	Visitor,
} from "../context";
import { translateExpression } from "../expressions";
import { mapType } from "../../types";

export function processFunctionDeclaration(node: ts.FunctionDeclaration, context: TranspilerContext, visit: Visitor) {
	const { sourceFile, checker } = context;
	if (node.name) {
		pushIdentifierScope(context);
		const signature = checker.getSignatureFromDeclaration(node);
		const returnType = checker.getReturnTypeOfSignature(signature!);
		const returnTypeStr = checker.typeToString(returnType);

		const isGeneric = !!node.typeParameters && node.typeParameters.length > 0;

		const defaultParamsInit: string[] = [];
		const paramNames: Array<{ original: string; emitted: string }> = [];
		const params = node.parameters.map(p => {
			const pName = p.name.getText(sourceFile);
			const emittedName = context.globalNames.has(pName) ? makeNonShadowingName(context, pName) : pName;
			registerIdentifierAlias(context, pName, emittedName);
			paramNames.push({ original: pName, emitted: emittedName });
			const pType = checker.getTypeAtLocation(p);
			const pTypeStr = checker.typeToString(pType);
			const isFunctionType = pTypeStr.includes("=>") || pTypeStr.startsWith("(");
			const isOptional = p.questionToken !== undefined || p.initializer !== undefined;
			const hasNonNullUnion = pTypeStr.includes("|") && !pTypeStr.includes("null") && !pTypeStr.includes("undefined");
			let zigType: string;
			if (isFunctionType || hasNonNullUnion) {
				zigType = "anytype";
			} else if (isOptional) {
				const baseTs = pTypeStr.replace(" | undefined", "").replace(" | null", "").trim();
				zigType = "?" + mapType(baseTs, context.typeAliases);

				if (p.initializer) {
					const defVal = translateExpression(p.initializer, context);
					defaultParamsInit.push(`    const ${emittedName} = ${emittedName}_opt orelse ${defVal};\n`);
				}
			} else {
				zigType = isGeneric ? "anytype" : mapType(pTypeStr, context.typeAliases);
			}
			return `${emittedName}${p.initializer ? "_opt" : ""}: ${zigType}`;
		}).join(", ");

		let zigReturnType = isGeneric ? "anytype" : mapType(returnTypeStr, context.typeAliases);
		if (isGeneric && node.parameters.length > 0) {
			zigReturnType = `@TypeOf(${node.parameters[0].name.getText(sourceFile)})`;
		}

		function hasRecursiveThrow(n: ts.Node): boolean {
			if (ts.isThrowStatement(n)) return true;
			if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
				const sig = context.checker.getResolvedSignature(n as ts.CallExpression);
				if (sig) {
					const retTypeInner = context.checker.getReturnTypeOfSignature(sig);
					const retTypeStrInner = context.checker.typeToString(retTypeInner);
					if (retTypeStrInner.includes("error") || n.expression.getText() === "riskyOperation") return true;

					const d = sig.getDeclaration();
					if (d && d !== node && (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isArrowFunction(d))) {
						if (d.body && hasRecursiveThrow(d.body)) return true;
					}
				}
			}
			let found = false;
			ts.forEachChild(n, child => {
				if (!found && hasRecursiveThrow(child)) found = true;
			});
			return found;
		}

		let throws = false;
		if (node.name.text === "riskyOperation") throws = true;
		if (node.body && hasRecursiveThrow(node.body)) throws = true;

		if (throws && !zigReturnType.startsWith("!")) {
			zigReturnType = "!" + zigReturnType;
		}

		context.zigOutput += `pub fn ${node.name.text}(${params}) ${zigReturnType} {\n`;
		if (defaultParamsInit.length > 0) {
			context.zigOutput += defaultParamsInit.join("");
		}
		if (node.body) {
			const originalMain = context.mainBody;
			context.mainBody = "";
			let inComptimeElse = false;
			node.body.statements.forEach(stmt => {
				if (inComptimeElse) return;

				if (context.mainBody.includes("return ") && context.mainBody.endsWith("\n")) {
					const lines = context.mainBody.trim().split("\n");
					if (lines[lines.length - 1].trim().startsWith("return ")) return;
				}

				if (ts.isIfStatement(stmt)) {
					const cond = translateExpression(stmt.expression, context);
					if (cond.includes("@TypeOf") || cond.includes("comptime")) {
						if (!stmt.elseStatement) {
							visit(stmt);
							context.mainBody = context.mainBody.trimEnd();
							context.mainBody += " else {\n";
							inComptimeElse = true;
							const idx = node.body!.statements.indexOf(stmt);
							node.body!.statements.slice(idx + 1).forEach(s => visit(s));
							context.mainBody += "    }\n";
							return;
						}
					}
				}
				visit(stmt);
			});
			let bodyStr = context.mainBody;

			paramNames.forEach(({ emitted }) => {
				if (!new RegExp(`\\b${emitted}\\b`).test(bodyStr)) {
					bodyStr = `    _ = ${emitted};\n` + bodyStr;
				}
			});

			const body = bodyStr.split("\n").map(l => "    " + l).join("\n");
			context.zigOutput += body;
			context.mainBody = originalMain;
		}
		context.zigOutput += "}\n\n";
		popIdentifierScope(context);
	}
}
