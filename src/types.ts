export function mapType(originalTsType: string, aliases?: Map<string, string>): string {
	const tsType = originalTsType.trim();
	if (aliases && aliases.has(tsType)) {
		const result = aliases.get(tsType)!;
		return result;
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

		const isNumerUnion = parts.every(p => !isNaN(Number(p)));
		if (isNumerUnion) return "f64";
	}

	// Handle Generics: Container<number> -> Container(f64)
	if (tsType.includes("<")) {
		const base = tsType.split("<")[0].trim();
		const baseZig = aliases && aliases.has(base) ? aliases.get(base)! : base;
		const argsText = tsType.substring(tsType.indexOf("<") + 1, tsType.lastIndexOf(">"));
		const args = argsText.split(",").map(a => mapType(a.trim(), aliases)).join(", ");
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

export function normalizeLiteralType(zigType: string): string {
	if (zigType.startsWith('"') || zigType.startsWith("'")) return "[]const u8";
	if (!isNaN(Number(zigType))) return "f64";
	if (zigType === "true" || zigType === "false") return "bool";
	return zigType;
}
