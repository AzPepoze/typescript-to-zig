import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { translateExpression } from "./core";
import { getFormatSpecifier } from "./literals";
import { isExpressionOriginallyOptional, isOriginalOpt } from "../utils";

function isOptionalTypeString(typeStr: string): boolean {
	return typeStr.includes("null") || typeStr.includes("undefined") || typeStr.startsWith("?") || typeStr.includes("|");
}

function isNumericLikeType(typeStr: string): boolean {
	return typeStr.includes("number") || typeStr.includes("f64") || typeStr.includes("i") || typeStr.includes("u");
}

function isStringLikeType(typeStr: string): boolean {
	return typeStr.includes("string") || typeStr.includes("[]const u8") || typeStr.includes('"');
}

function isEqualityOperator(op: string): boolean {
	return op === "==" || op === "!=";
}

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

	if (ts.isTypeOfExpression(left) && ts.isStringLiteral(right)) {
		const varExpr = translateExpression(left.expression, context);
		const typeCheck = right.text;
		if (typeCheck === "string") {
			return `(@TypeOf(${varExpr}) == []const u8 or @TypeOf(${varExpr}) == [:0]const u8 or @TypeOf(${varExpr}) == ?[]const u8 or @TypeOf(${varExpr}) == ?[:0]const u8 or (@typeInfo(@TypeOf(${varExpr})) == .pointer and @typeInfo(@TypeOf(${varExpr})).pointer.size == .one and @typeInfo(@typeInfo(@TypeOf(${varExpr})).pointer.child) == .array and @typeInfo(@typeInfo(@TypeOf(${varExpr})).pointer.child).array.child == u8))`;
		}
		return `std.mem.eql(u8, @typeName(@TypeOf(${varExpr})), "${typeCheck}")`;
	}

	if (isEqualityOperator(op) && (ts.isPropertyAccessExpression(left) || ts.isPropertyAccessExpression(right))) {
		const isAnyPropertyAccess = (n: ts.Expression): boolean => {
			if (!ts.isPropertyAccessExpression(n)) return false;
			const baseType = checker.getTypeAtLocation(n.expression);
			const baseTypeStr = checker.typeToString(baseType);
			return baseTypeStr === "any" || baseTypeStr === "unknown";
		};
		if (isAnyPropertyAccess(left) || isAnyPropertyAccess(right)) {
			return op === "==" ? "false" : "true";
		}
	}

	if (isEqualityOperator(op)) {
		const leftExpr = translateExpression(left, context);
		const rightExpr = translateExpression(right, context);

		if (isStringLikeType(leftStr) || isStringLikeType(rightStr)) {
			const eqExpr = `std.mem.eql(u8, ${leftExpr}, ${rightExpr})`;
			return op === "==" ? eqExpr : `!${eqExpr}`;
		}

		if (leftStr === "K" || rightStr === "K") {
			const eqExpr = `__mapKeyEquals(K, ${leftExpr}, ${rightExpr})`;
			return op === "==" ? eqExpr : `!${eqExpr}`;
		}
	}

	if (op === "<<" || op === ">>" || op === "&" || op === "|" || op === "^") {
		const leftExpr = translateExpression(left, context);
		const rightExpr = translateExpression(right, context);
		const leftInt = `@as(i32, __toI32(${leftExpr}))`;
		const rightInt = `@as(i32, __toI32(${rightExpr}))`;
		if (op === "<<" || op === ">>") {
			return `@as(f64, @floatFromInt(${leftInt} ${op} @as(u5, @intCast(@mod(@as(i32, @intCast(${rightInt})), 32)))))`;
		}
		return `@as(f64, @floatFromInt(${leftInt} ${op} ${rightInt}))`;
	}

	if (op === "%") {
		const leftExpr = translateExpression(left, context);
		const rightExpr = translateExpression(right, context);
		const leftIsNumeric = isNumericLikeType(leftStr);
		const rightIsNumeric = isNumericLikeType(rightStr);
		if (leftIsNumeric && rightIsNumeric) {
			return `@mod(${leftExpr}, ${rightExpr})`;
		}
	}

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

	if (op === "=") {
		const leftIsOptional = isOptionalTypeString(leftStr);
		const rightIsOptional = isOptionalTypeString(rightStr) || isExpressionOriginallyOptional(right as ts.Expression, checker);
		const leftExpr = translateExpression(left, context);
		let rightExpr = translateExpression(right, context);
		if (!leftIsOptional && rightIsOptional && !rightExpr.endsWith(".?") && rightExpr !== "null") {
			rightExpr = `${rightExpr}.?`;
		}
		return `${leftExpr} ${op} ${rightExpr}`;
	}

	return `${translateExpression(left, context)} ${op} ${translateExpression(right, context)}`;
}
