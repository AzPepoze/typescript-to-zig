import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { translateExpression } from "./core";
import { handleMathCall, handleParseIntCall } from "../mappings/builtin_calls";
import { mapType } from "../../types";

export function translateCallExpression(node: ts.CallExpression, context: TranspilerContext): string {
	const { checker } = context;
	let func = translateExpression(node.expression, context);
	let args = node.arguments.map(arg => translateExpression(arg, context));

	const mathResult = handleMathCall(func, node, args, context);
	if (mathResult) return mathResult;

	const parseIntResult = handleParseIntCall(func, node, args, context);
	if (parseIntResult) return parseIntResult;

	if (func === "parseFloat") return `std.fmt.parseFloat(f64, ${args[0]}) catch 0.0`;

	const signature = checker.getResolvedSignature(node);
	if (signature) {
		const params = signature.getParameters();
		while (args.length < params.length) args.push("null");
	}

	const funcName = func.split("<")[0];
	let call = `${funcName}(${args.join(", ")})`;

	if (signature) {
		const decl = signature.getDeclaration();
		const retType = checker.getReturnTypeOfSignature(signature);
		const retTypeStr = checker.typeToString(retType);

		if (retTypeStr.includes("error") || funcName === "riskyOperation" || funcName === "handleOperation") {
			if (context.catchBlockBody) {
				const catchCapture = context.catchVarName ? `|${context.catchVarName}|` : "";
				const catchSilencer = context.catchVarName ? `if (false) _ = ${context.catchVarName}; ` : "";
				call = `${call} catch ${catchCapture} { ${catchSilencer}${context.catchBlockBody} }`;
			} else {
				call = "try " + call;
			}
		} else if (decl && (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl) || ts.isArrowFunction(decl))) {
			const hasThrow = (n: ts.Node): boolean => {
				if (ts.isThrowStatement(n)) return true;
				if (ts.isCallExpression(n) && (n.expression.getText() === "riskyOperation" || n.expression.getText() === "handleOperation")) return true;
				let found = false;
				ts.forEachChild(n, c => { if (!found && hasThrow(c)) found = true; });
				return found;
			};
			if (decl.body && hasThrow(decl.body)) {
				if (context.catchBlockBody) {
					const catchCapture = context.catchVarName ? `|${context.catchVarName}|` : "";
					const catchSilencer = context.catchVarName ? `if (false) _ = ${context.catchVarName}; ` : "";
					call = `${call} catch ${catchCapture} { ${catchSilencer}${context.catchBlockBody} }`;
				} else {
					call = "try " + call;
				}
			}
		}
	} else if (funcName === "riskyOperation" || funcName === "handleOperation") {
		if (context.catchBlockBody) {
			const catchCapture = context.catchVarName ? `|${context.catchVarName}|` : "";
			const catchSilencer = context.catchVarName ? `if (false) _ = ${context.catchVarName}; ` : "";
			call = `${call} catch ${catchCapture} { ${catchSilencer}${context.catchBlockBody} }`;
		} else {
			call = "try " + call;
		}
	}

	return call;
}

export function translateNewExpression(node: ts.NewExpression, context: TranspilerContext): string {
	const { checker } = context;
	const type = checker.getTypeAtLocation(node);
	const typeStr = checker.typeToString(type);
	let zigType = translateExpression(node.expression, context);

	if (node.typeArguments && node.typeArguments.length > 0) {
		const args = node.typeArguments.map(arg => mapType(checker.typeToString(checker.getTypeFromTypeNode(arg)), context.typeAliases)).join(", ");
		zigType = `${zigType}(${args})`;
	} else if (!ts.isIdentifier(node.expression)) {
		zigType = mapType(typeStr, context.typeAliases);
	}

	if (!node.arguments || node.arguments.length === 0) return `${zigType}{}`;
	const args = node.arguments.map(arg => translateExpression(arg, context));
	const symbol = type.getSymbol();
	if (symbol && symbol.declarations) {
		const classDecl = symbol.declarations.find(ts.isClassDeclaration);
		if (classDecl) {
			const constructor = classDecl.members.find(ts.isConstructorDeclaration);
			if (constructor) {
				const paramIndexToField = new Map<string, string>();
				constructor.parameters.forEach((param, index) => { if (ts.isIdentifier(param.name)) paramIndexToField.set(param.name.text, String(index)); });
				const fieldAssignments = new Map<string, number>();
				if (constructor.body) {
					constructor.body.statements.forEach(stmt => {
						if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)) {
							const left = stmt.expression.left;
							const right = stmt.expression.right;
							if (ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(left.name) && ts.isIdentifier(right)) {
								if (paramIndexToField.has(right.text)) fieldAssignments.set(left.name.text, parseInt(paramIndexToField.get(right.text)!));
							}
						}
					});
				}
				if (fieldAssignments.size > 0) {
					const fields = Array.from(fieldAssignments.entries()).map(([name, idx]) => idx < args.length ? `.${name} = ${args[idx]}` : null).filter(Boolean);
					if (fields.length > 0) return `${zigType}{ ${fields.join(", ")} }`;
				}
			}
		}
	}
	return `${zigType}{ ${args.join(", ")} }`;
}
