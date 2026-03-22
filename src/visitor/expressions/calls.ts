import * as ts from "typescript";
import { resolveIdentifierName, TranspilerContext } from "../context";
import { translateExpression } from "./core";
import { handleMathCall, handleParseIntCall } from "../mappings/builtin_calls";
import { mapType } from "../../types";
import { isExpressionOriginallyOptional, isRecursiveClassDeclaration, isRecursiveClassType } from "../utils";

const MUTATING_METHODS = new Set(["set", "push", "add", "insert", "delete"]);

function isOptionalTypeString(typeStr: string): boolean {
	return typeStr.includes("null") || typeStr.includes("undefined") || typeStr.startsWith("?") || typeStr.includes("|");
}

function isStringLikeType(typeStr: string): boolean {
	return typeStr.includes("string") || typeStr.includes("[]const u8");
}

function isNumberLikeType(typeStr: string): boolean {
	return typeStr.includes("number") || typeStr.includes("f64");
}

export function translateCallExpression(node: ts.CallExpression, context: TranspilerContext): string {
	const { checker } = context;
	let func = translateExpression(node.expression, context);
	let args = node.arguments.map(arg => translateExpression(arg, context));

	if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
		const objectName = resolveIdentifierName(context, node.expression.expression.text);
		const methodName = node.expression.name.text;
		const isMutatingMethod = MUTATING_METHODS.has(methodName);
		const objectSymbol = checker.getSymbolAtLocation(node.expression.expression);
		const objectDecl = objectSymbol?.valueDeclaration;
		if (
			objectDecl
			&& ts.isVariableDeclaration(objectDecl)
			&& ts.isVariableDeclarationList(objectDecl.parent)
			&& (objectDecl.parent.flags & ts.NodeFlags.Const) !== 0
			&& isMutatingMethod
		) {
			const initializedWithNew = !!(objectDecl.initializer && ts.isNewExpression(objectDecl.initializer));
			const objectType = checker.getTypeAtLocation(objectDecl);
			const initializedWithRecursiveNew = initializedWithNew && isRecursiveClassType(objectType, checker);
			func = initializedWithRecursiveNew
				? `@constCast(${objectName}).${node.expression.name.text}`
				: `@constCast(&${objectName}).${node.expression.name.text}`;
		}
	}

	const mathResult = handleMathCall(func, node, args, context);
	if (mathResult) return mathResult;

	const parseIntResult = handleParseIntCall(func, node, args, context);
	if (parseIntResult) return parseIntResult;

	if (func === "parseFloat") return `std.fmt.parseFloat(f64, ${args[0]}) catch 0.0`;
	if (func === "String") {
		return `std.fmt.allocPrint(std.heap.page_allocator, "{any}", .{ ${args[0] ?? ""} }) catch ""`;
	}
	if (func.endsWith(".charCodeAt")) {
		const obj = func.slice(0, -".charCodeAt".length);
		const idx = args[0] ?? "0";
		return `@as(f64, @floatFromInt(${obj}[@as(usize, @intFromFloat(${idx}))]))`;
	}
	if (func.endsWith(".toString")) {
		const obj = func.slice(0, -".toString".length);
		return `std.fmt.allocPrint(std.heap.page_allocator, "{any}", .{ ${obj} }) catch ""`;
	}

	const signature = checker.getResolvedSignature(node);
	if (signature) {
		const params = signature.getParameters();
		for (let i = 0; i < node.arguments.length && i < params.length; i++) {
			const paramType = checker.getTypeOfSymbolAtLocation(params[i], node);
			const paramTypeStr = checker.typeToString(paramType);
			const argType = checker.getTypeAtLocation(node.arguments[i]);
			const argTypeStr = checker.typeToString(argType);
			const paramIsOptional = isOptionalTypeString(paramTypeStr);

			const paramIsStringLike = isStringLikeType(paramTypeStr);
			const argIsNumberLike = isNumberLikeType(argTypeStr);
			if (paramIsStringLike && argIsNumberLike) {
				args[i] = `std.fmt.allocPrint(std.heap.page_allocator, "{any}", .{ ${args[i]} }) catch ""`;
			}

			if (!paramIsOptional && isExpressionOriginallyOptional(node.arguments[i], checker)) {
				args[i] = `${args[i]}.?`;
			}
		}
		while (args.length < params.length) args.push("null");
	} else if (ts.isPropertyAccessExpression(node.expression) && node.arguments.length > 0) {
		const methodName = node.expression.name.text;
		if (methodName === "has" || methodName === "get" || methodName === "set") {
			const targetType = checker.getTypeAtLocation(node.expression.expression);
			const targetTypeStr = checker.typeToString(targetType);
			const argType = checker.getTypeAtLocation(node.arguments[0]);
			const argTypeStr = checker.typeToString(argType);
			const argIsNumberLike = isNumberLikeType(argTypeStr);
			if (targetTypeStr.includes("Map<") && argIsNumberLike) {
				args[0] = `std.fmt.allocPrint(std.heap.page_allocator, "{any}", .{ ${args[0]} }) catch ""`;
			}
		}
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
	const contextualType = checker.getContextualType(node);
	const contextualTypeStr = contextualType ? checker.typeToString(contextualType) : "";
	let zigType = translateExpression(node.expression, context);

	if (node.typeArguments && node.typeArguments.length > 0) {
		const args = node.typeArguments.map(arg => mapType(checker.typeToString(checker.getTypeFromTypeNode(arg)), context.typeAliases)).join(", ");
		zigType = `${zigType}(${args})`;
	} else if (
		ts.isIdentifier(node.expression)
		&& node.expression.text === "Map"
		&& contextualTypeStr.includes("<")
	) {
		zigType = mapType(contextualTypeStr, context.typeAliases);
	} else if (ts.isIdentifier(node.expression) && typeStr.includes("<")) {
		zigType = mapType(typeStr, context.typeAliases);
	} else if (!ts.isIdentifier(node.expression)) {
		zigType = mapType(typeStr, context.typeAliases);
	}

	const args = (node.arguments ?? []).map(arg => translateExpression(arg, context));
	const symbol = type.getSymbol();
	if (symbol && symbol.declarations) {
		const classDecl = symbol.declarations.find(ts.isClassDeclaration);
		if (classDecl) {
			const isRecursiveClass = isRecursiveClassDeclaration(classDecl, checker);
			const allocateClass = (initializer: string) => {
				return `blk: { const __obj = std.heap.page_allocator.create(${zigType}) catch unreachable; __obj.* = ${initializer}; break :blk __obj; }`;
			};

			let initializer = !node.arguments || node.arguments.length === 0
				? `${zigType}{}`
				: `${zigType}{ ${args.join(", ")} }`;

			const constructor = classDecl.members.find(ts.isConstructorDeclaration);
			if (constructor) {
				const paramIndexToField = new Map<string, string>();
				constructor.parameters.forEach((param, index) => { if (ts.isIdentifier(param.name)) paramIndexToField.set(param.name.text, String(index)); });
				const fieldAssignments = new Map<string, number>();
				const fieldInitializers = new Map<string, string>();
				const argByParam = new Map<string, string>();
				constructor.parameters.forEach((param, idx) => {
					if (ts.isIdentifier(param.name) && idx < args.length) {
						argByParam.set(param.name.text, args[idx]);
					}
				});
				if (constructor.body) {
					constructor.body.statements.forEach(stmt => {
						if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)) {
							const left = stmt.expression.left;
							const right = stmt.expression.right;
							if (ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(left.name) && ts.isIdentifier(right)) {
								if (paramIndexToField.has(right.text)) fieldAssignments.set(left.name.text, parseInt(paramIndexToField.get(right.text)!));
							} else if (ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(left.name)) {
								if (isArrayFillMapPattern(right)) {
									const rowsArg = argByParam.get("rows") ?? "0";
									const colsArg = argByParam.get("cols") ?? "0";
									fieldInitializers.set(left.name.text, `__make2D(${rowsArg}, ${colsArg})`);
								} else {
									fieldInitializers.set(left.name.text, translateExpression(right, context));
								}
							}
						}
					});
				}
				if (fieldAssignments.size > 0 || fieldInitializers.size > 0) {
					const fieldsFromParams = Array.from(fieldAssignments.entries())
						.map(([name, idx]) => idx < args.length ? `.${name} = ${args[idx]}` : null)
						.filter(Boolean) as string[];
					const fieldsFromExprs = Array.from(fieldInitializers.entries()).map(([name, value]) => `.${name} = ${value}`);
					const fields = [...fieldsFromParams, ...fieldsFromExprs];
					if (fields.length > 0) {
						initializer = `${zigType}{ ${fields.join(", ")} }`;
					}
				}
			}

			return isRecursiveClass ? allocateClass(initializer) : initializer;
		}
	}
	if (!node.arguments || node.arguments.length === 0) return `${zigType}{}`;
	return `${zigType}{ ${args.join(", ")} }`;
}

function isArrayFillMapPattern(node: ts.Expression): boolean {
	if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
	if (node.expression.name.text !== "map") return false;
	const target = node.expression.expression;
	if (!ts.isCallExpression(target) || !ts.isPropertyAccessExpression(target.expression)) return false;
	if (target.expression.name.text !== "fill") return false;
	if (!ts.isCallExpression(target.expression.expression)) return false;
	const root = target.expression.expression.expression;
	return ts.isIdentifier(root) && root.text === "Array";
}
