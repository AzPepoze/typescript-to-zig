import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { isOriginalOpt } from "../utils";

export function handleMathCall(func: string, node: ts.CallExpression, args: string[], context: TranspilerContext): string | null {
	if (func === "Math.pow") {
		const base = args[0];
		const exp = args[1] ?? "0";
		const bLabel = isOriginalOpt(node.arguments[0], context.checker) ? `(${base} orelse 0)` : base;
		const eLabel = node.arguments[1] && isOriginalOpt(node.arguments[1], context.checker) ? `(${exp} orelse 2.0)` : (exp === "null" ? "2.0" : exp);
		return `std.math.pow(f64, ${bLabel}, ${eLabel})`;
	}
	if (func === "Math.abs") return `@abs(${args[0]})`;
	if (func === "Math.sqrt") return `std.math.sqrt(${args[0]})`;
	if (func === "Math.floor") return `std.math.floor(${args[0]})`;
	if (func === "Math.ceil") return `std.math.ceil(${args[0]})`;
	if (func === "Math.round") return `std.math.round(${args[0]})`;
	if (func === "Math.max") return `@max(${args[0]}, ${args[1] ?? args[0]})`;
	if (func === "Math.min") return `@min(${args[0]}, ${args[1] ?? args[0]})`;
	return null;
}

export function handleParseIntCall(func: string, node: ts.CallExpression, args: string[], context: TranspilerContext): string | null {
	if (func === "parseInt") {
		let strArg = args[0];
		const arg0 = node.arguments[0];
		const t = context.checker.getTypeAtLocation(arg0);
		const tStr = context.checker.typeToString(t);
		const isStringLiteral = tStr.startsWith("\"") || (t.isStringLiteral && t.isStringLiteral());

		const typeInfo = t.getSymbol()?.valueDeclaration ? context.checker.getTypeAtLocation(t.getSymbol()!.valueDeclaration!) : t;
		const tiStr = context.checker.typeToString(typeInfo);

		if (isStringLiteral || tiStr.includes("const [") || tiStr.includes("u8")) {
			strArg = `${strArg}[0..${strArg}.len]`;
		}

		const radix = args[1] ?? "10";
		return `@as(f64, @floatFromInt(std.fmt.parseInt(i32, ${strArg}, ${radix}) catch 0))`;
	}
	return null;
}
