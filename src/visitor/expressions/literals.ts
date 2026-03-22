import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { translateExpression } from "./core";
import { isOriginalOpt } from "../utils";

export function getFormatSpecifier(node: ts.Node, checker: ts.TypeChecker): string {
	const type = checker.getTypeAtLocation(node);
	const typeStr = checker.typeToString(type);
	if (ts.isStringLiteral(node) || typeStr === "string" || typeStr.includes('"') || typeStr.includes("'")) return "{s}";
	if (typeStr === "boolean") return "{any}";
	if (typeStr === "bigint") return "{d}";
	if (typeStr === "number") return "{any}";
	return "{any}";
}

export function translateTemplateLiteral(node: ts.TemplateExpression, context: TranspilerContext): string {
	const { checker } = context;
	const parts: { text: string, isExpr: boolean }[] = [{ text: node.head.text, isExpr: false }];

	node.templateSpans.forEach(span => {
		parts.push({ text: translateExpression(span.expression, context), isExpr: true });
		if (span.literal.text) {
			parts.push({ text: span.literal.text, isExpr: false });
		}
	});

	const hasExpr = parts.some(p => p.isExpr);
	if (!hasExpr) return `"${node.head.text}${node.templateSpans.map(s => s.literal.text).join("")}"`;

	const fmtString = parts.map(p => {
		if (!p.isExpr) return p.text.replace(/\{/g, "{{").replace(/\}/g, "}}");
		const spanIdx = parts.filter((_, i) => i < parts.indexOf(p) && parts[i].isExpr).length;
		const span = node.templateSpans[spanIdx];
		return getFormatSpecifier(span.expression, checker);
	}).join("");

	const args = parts.filter(p => p.isExpr).map(p => {
		const spanIdx = parts.filter((_, i) => i < parts.indexOf(p) && parts[i].isExpr).length;
		const span = node.templateSpans[spanIdx];
		let val = p.text;
		if (isOriginalOpt(span.expression, checker)) {
			const type = checker.getTypeAtLocation(span.expression);
			const typeStr = checker.typeToString(type);
			val = `(${val} orelse ${typeStr.includes("string") ? '""' : "0"})`;
		}
		return val;
	}).join(", ");

	return `std.fmt.allocPrint(std.heap.page_allocator, "${fmtString}", .{ ${args} }) catch ""`;
}
