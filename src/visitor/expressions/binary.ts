import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { translateExpression } from "./core";
import { getFormatSpecifier } from "./literals";
import { isOriginalOpt } from "../utils";

export function translateBinaryExpression(node: ts.BinaryExpression, context: TranspilerContext): string {
	const { sourceFile, checker } = context;
	const left = node.left;
	const right = node.right;
	let op = node.operatorToken.getText(sourceFile);

	const leftType = checker.getTypeAtLocation(left);
	const rightType = checker.getTypeAtLocation(right);
	const leftStr = checker.typeToString(leftType);
	const rightStr = checker.typeToString(rightType);

	if (op === "===") op = "==";
	if (op === "!==") op = "!=";
	if (op === "||") op = "or";
	if (op === "&&") op = "and";

	if (op === "+") {
		const isString = leftStr.includes("string") || rightStr.includes("string") || leftStr.includes('"') || rightStr.includes('"');
		if (isString) {
			let l = translateExpression(left, context);
			let r = translateExpression(right, context);

			const leftFmt = getFormatSpecifier(left, checker);
			const rightFmt = getFormatSpecifier(right, checker);

			let lVal = l;
			let rVal = r;
			if (isOriginalOpt(left, checker)) {
				const t = checker.getTypeAtLocation(left);
				const tStr = checker.typeToString(t);
				lVal = `(${l} orelse ${tStr.includes("string") ? '""' : "0"})`;
			}
			if (isOriginalOpt(right, checker)) {
				const t = checker.getTypeAtLocation(right);
				const tStr = checker.typeToString(t);
				rVal = `(${r} orelse ${tStr.includes("string") ? '""' : "0"})`;
			}

			return `std.fmt.allocPrint(std.heap.page_allocator, "${leftFmt}${rightFmt}", .{ ${lVal}, ${rVal} }) catch ""`;
		}
	}

	if (ts.isTypeOfExpression(left) && ts.isStringLiteral(right)) {
		const varExpr = translateExpression(left.expression, context);
		const typeCheck = right.text;
		if (typeCheck === "string") {
			return `(@TypeOf(${varExpr}) == []const u8 or @TypeOf(${varExpr}) == [:0]const u8 or @TypeOf(${varExpr}) == ?[]const u8 or @TypeOf(${varExpr}) == ?[:0]const u8 or (@typeInfo(@TypeOf(${varExpr})) == .pointer and @typeInfo(@TypeOf(${varExpr})).pointer.size == .one and @typeInfo(@typeInfo(@TypeOf(${varExpr})).pointer.child) == .array and @typeInfo(@typeInfo(@TypeOf(${varExpr})).pointer.child).array.child == u8))`;
		}
		return `std.mem.eql(u8, @typeName(@TypeOf(${varExpr})), "${typeCheck}")`;
	}

	return `${translateExpression(left, context)} ${op} ${translateExpression(right, context)}`;
}
