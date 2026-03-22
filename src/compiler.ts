import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { createVisitor } from "./visitor/index";
import { TranspilerContext } from "./visitor/context";
import { logger } from "./utils/logger";

export function runTranspiler(testDir: string, outDir: string) {
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir);
	}

	const files = fs.readdirSync(testDir).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "tsconfig.json");
	logger.info(`Found ${files.length} files in ${testDir}: ${files.join(", ")}`);

	const program = ts.createProgram(files.map(f => path.join(testDir, f)), {
		strict: true,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
	});
	const checker = program.getTypeChecker();

	for (const file of files) {
		const sourceFile = program.getSourceFile(path.join(testDir, file));
		if (!sourceFile) continue;

		const baseName = path.basename(file, ".ts");
		const context: TranspilerContext = {
			zigOutput: `// Generated from ${file}\nconst std = @import("std");\n\nfn __mapKeyEquals(comptime K: type, a: K, b: K) bool {\n    const info = @typeInfo(K);\n    if (info == .pointer and info.pointer.size == .slice and info.pointer.child == u8) {\n        return std.mem.eql(u8, a, b);\n    }\n    return a == b;\n}\n\nfn Map(comptime K: type, comptime V: type) type {\n    return struct {\n        keys: [1024]K = undefined,\n        vals: [1024]V = undefined,\n        len: usize = 0,\n\n        pub fn has(self: *const @This(), key: K) bool {\n            var i: usize = 0;\n            while (i < self.len) : (i += 1) {\n                if (__mapKeyEquals(K, self.keys[i], key)) return true;\n            }\n            return false;\n        }\n\n        pub fn get(self: *const @This(), key: K) ?V {\n            var i: usize = 0;\n            while (i < self.len) : (i += 1) {\n                if (__mapKeyEquals(K, self.keys[i], key)) return self.vals[i];\n            }\n            return null;\n        }\n\n        pub fn set(self: *@This(), key: K, value: V) bool {\n            var i: usize = 0;\n            while (i < self.len) : (i += 1) {\n                if (__mapKeyEquals(K, self.keys[i], key)) {\n                    self.vals[i] = value;\n                    return true;\n                }\n            }\n            if (self.len >= self.keys.len) return false;\n            self.keys[self.len] = key;\n            self.vals[self.len] = value;\n            self.len += 1;\n            return true;\n        }\n\n        pub fn values(self: *const @This()) []const V {\n            return self.vals[0..self.len];\n        }\n    };\n}\n\n`,
			zigOutput: `// Generated from ${file}\nconst std = @import("std");\n\nfn __mapKeyEquals(comptime K: type, a: K, b: K) bool {\n    const info = @typeInfo(K);\n    if (info == .pointer and info.pointer.size == .slice and info.pointer.child == u8) {\n        return std.mem.eql(u8, a, b);\n    }\n    return a == b;\n}\n\nfn __slicePush(comptime T: type, src: []T, value: T) []T {\n    const out = std.heap.page_allocator.alloc(T, src.len + 1) catch return src;\n    std.mem.copyForwards(T, out[0..src.len], src);\n    out[src.len] = value;\n    return out;\n}\n\nfn Map(comptime K: type, comptime V: type) type {\n    return struct {\n        keys: [1024]K = undefined,\n        vals: [1024]V = undefined,\n        len: usize = 0,\n\n        pub fn has(self: *const @This(), key: K) bool {\n            var i: usize = 0;\n            while (i < self.len) : (i += 1) {\n                if (__mapKeyEquals(K, self.keys[i], key)) return true;\n            }\n            return false;\n        }\n\n        pub fn get(self: *const @This(), key: K) ?V {\n            var i: usize = 0;\n            while (i < self.len) : (i += 1) {\n                if (__mapKeyEquals(K, self.keys[i], key)) return self.vals[i];\n            }\n            return null;\n        }\n\n        pub fn set(self: *@This(), key: K, value: V) bool {\n            var i: usize = 0;\n            while (i < self.len) : (i += 1) {\n                if (__mapKeyEquals(K, self.keys[i], key)) {\n                    self.vals[i] = value;\n                    return true;\n                }\n            }\n            if (self.len >= self.keys.len) return false;\n            self.keys[self.len] = key;\n            self.vals[self.len] = value;\n            self.len += 1;\n            return true;\n        }\n\n        pub fn values(self: *const @This()) []const V {\n            return self.vals[0..self.len];\n        }\n    };\n}\n\n`,
			mainBody: "",
			sourceFile,
			checker,
			importedModules: new Set(),
			typeAliases: new Map(),
			importAliases: [],
			globalNames: new Set(),
			identifierScopes: [new Map()],
		};

		sourceFile.statements.forEach(stmt => {
			if (!ts.isVariableStatement(stmt)) return;
			stmt.declarationList.declarations.forEach(decl => {
				if (ts.isIdentifier(decl.name)) {
					context.globalNames.add(decl.name.text);
				}
			});
		});

		sourceFile.statements.forEach(stmt => {
			if (ts.isFunctionDeclaration(stmt) && stmt.name) {
				context.globalNames.add(stmt.name.text);
			}
			if (ts.isClassDeclaration(stmt)) {
				stmt.members.forEach(member => {
					if ((ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) && member.name && ts.isIdentifier(member.name)) {
						context.globalNames.add(member.name.text);
					}
				});
			}
		});

		const visit = createVisitor(context);
		ts.forEachChild(sourceFile, visit);

		const initCalls = context.importAliases.map(alias => `    if (@hasDecl(${alias}, "_init")) ${alias}._init();`).join("\n");
		const initBody = context.mainBody;

		context.zigOutput += `
pub var _is_initialized = false;
pub fn _init() void {
    if (_is_initialized) return;
    _is_initialized = true;
${initCalls}
${initBody}}

pub fn main() void {
    _init();
}
`;

		const outPath = path.join(outDir, `${baseName}.zig`);
		fs.writeFileSync(outPath, context.zigOutput);
		try {
			require("child_process").execSync(`zig fmt ${outPath}`, { stdio: "ignore" });
		} catch (e) {
			logger.warn(`Failed to format ${outPath}`);
		}
		logger.info(`Transpiled ${file} -> out/${baseName}.zig`);
	}
}
