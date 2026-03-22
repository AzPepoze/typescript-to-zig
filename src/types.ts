export function mapType(originalTsType: string, aliases?: Map<string, string>): string {
	const tsType = originalTsType.trim();
	if (aliases && aliases.has(tsType)) {
		return aliases.get(tsType)!;
	}

	if (tsType.startsWith("{") && tsType.endsWith("}")) {
		return mapObjectLiteralType(tsType, aliases);
	}

	if (tsType.includes("|")) {
		const parts = tsType.split("|").map(p => p.trim());
		const hasNull = parts.includes("null") || parts.includes("undefined");
		const otherTypes = parts.filter(p => p !== "null" && p !== "undefined");

		if (hasNull && otherTypes.length === 1) {
			return "?" + mapType(otherTypes[0], aliases);
		}

		// Handle literal unions: "red" | "green" -> []const u8
		const isStringUnion = parts.some(p => p.startsWith('"') || p.startsWith("'"));
		if (isStringUnion) return "[]const u8";

		const isNumberUnion = parts.every(p => !isNaN(Number(p)));
		if (isNumberUnion) return "f64";
	}

	// Handle Generics: Container<number> -> Container(f64)
	if (tsType.includes("<")) {
		const base = tsType.split("<")[0].trim();
		const baseZig = aliases && aliases.has(base) ? aliases.get(base)! : base;
		const argsText = tsType.substring(tsType.indexOf("<") + 1, tsType.lastIndexOf(">"));
		const args = splitTopLevel(argsText, ",").map(a => mapType(a.trim(), aliases)).join(", ");
		return `${baseZig}(${args})`;
	}

	if (tsType.startsWith("[") && tsType.endsWith("]")) {
		const parts = tsType.slice(1, -1).split(",").map(p => p.trim());
		const mappedParts = parts.map(p => mapType(p, aliases));
		const firstType = mappedParts[0];
		const allSame = mappedParts.every(p => p === firstType);
		if (allSame) {
			return `[${parts.length}]${firstType}`;
		}
		return "anytype";
	}

	if (tsType.endsWith("[]")) {
		const base = tsType.slice(0, -2);
		return "[]" + mapType(base, aliases);
	}
	if (tsType.startsWith("Array<") && tsType.endsWith(">")) {
		const base = tsType.slice(6, -1);
		return "[]" + mapType(base, aliases);
	}

	const lower = tsType.toLowerCase();
	switch (lower) {
		case "number": return "f64";
		case "string": return "[]const u8";
		case "boolean": return "bool";
		case "void": return "void";
		case "any": return "anyopaque";
		case "bigint": return "i128";
		case "error": return "anyerror";
		default: return tsType;
	}
}

function mapObjectLiteralType(tsType: string, aliases?: Map<string, string>): string {
	const body = tsType.slice(1, -1).trim();
	if (!body) return "struct {}";

	const rawFields = splitTopLevel(body, ";").map((field) => field.trim()).filter(Boolean);
	const fields = rawFields
		.map((field) => {
			const colonIndex = field.indexOf(":");
			if (colonIndex < 0) return null;
			const name = field.slice(0, colonIndex).trim().replace(/^readonly\s+/, "").replace(/\?$/, "");
			const type = field.slice(colonIndex + 1).trim();
			if (!name || !type) return null;
			return `${name}: ${mapType(type, aliases)}`;
		})
		.filter(Boolean) as string[];

	if (fields.length === 0) return "struct {}";
	return `struct { ${fields.join(", ")} }`;
}

function splitTopLevel(value: string, separator: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let angleDepth = 0;
	let parenDepth = 0;
	let braceDepth = 0;
	let bracketDepth = 0;

	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch === "<") angleDepth++;
		else if (ch === ">") angleDepth = Math.max(0, angleDepth - 1);
		else if (ch === "(") parenDepth++;
		else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
		else if (ch === "{") braceDepth++;
		else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
		else if (ch === "[") bracketDepth++;
		else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);

		if (
			ch === separator
			&& angleDepth === 0
			&& parenDepth === 0
			&& braceDepth === 0
			&& bracketDepth === 0
		) {
			parts.push(value.slice(start, i));
			start = i + 1;
		}
	}

	parts.push(value.slice(start));
	return parts;
}

export function normalizeLiteralType(zigType: string): string {
	if (zigType.startsWith('"') || zigType.startsWith("'")) return "[]const u8";
	if (!isNaN(Number(zigType))) return "f64";
	if (zigType === "true" || zigType === "false") return "bool";
	return zigType;
}
