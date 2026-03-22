import * as fs from "fs";
import * as path from "path";
import { TranspilerContext } from "./context";

export interface ResolvedModule {
	kind: "relative" | "external" | "unsupported";
	zigModule: string;
	moduleAlias: string;
	sourcePath?: string;
	diagnostic?: string;
}

export function resolveModuleForZig(moduleSpec: string, sourceFilePath: string): ResolvedModule {
	if (isRelativeModuleSpecifier(moduleSpec)) {
		const zigModule = toRelativeZigModule(moduleSpec);
		return {
			kind: "relative",
			zigModule,
			moduleAlias: toModuleAlias(zigModule),
		};
	}

	const resolvedSource = resolveExternalModuleSource(moduleSpec, sourceFilePath);
	if (resolvedSource) {
		const zigModule = toExternalZigModule(resolvedSource);
		return {
			kind: "external",
			zigModule,
			moduleAlias: toModuleAlias(zigModule),
			sourcePath: resolvedSource,
		};
	}

	return {
		kind: "unsupported",
		zigModule: "",
		moduleAlias: "",
		diagnostic: `Unsupported module specifier \"${moduleSpec}\" for native Zig runtime`,
	};
}

export function registerUnsupportedModule(moduleSpec: string, context: TranspilerContext): string {
	if (!context.unsupportedModules.has(moduleSpec)) {
		context.unsupportedModules.add(moduleSpec);
		const diagnostic = `Unsupported module specifier \"${moduleSpec}\" for native Zig runtime`;
		context.diagnostics.push(diagnostic);
	}

	const symbolName = `__unsupported_module_${toModuleAlias(moduleSpec || "unknown")}`;
	const escapedSpec = moduleSpec.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"');
	return `const ${symbolName} = @compileError(\"Unsupported module specifier: ${escapedSpec}\");`;
}

export function isRelativeModuleSpecifier(moduleSpec: string): boolean {
	return moduleSpec.startsWith("./") || moduleSpec.startsWith("../") || moduleSpec.startsWith("/");
}

function toRelativeZigModule(moduleSpec: string): string {
	let normalized = moduleSpec;
	if (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	if (normalized.endsWith(".ts")) {
		normalized = normalized.slice(0, -3);
	}
	if (normalized.endsWith(".js")) {
		normalized = normalized.slice(0, -3);
	}
	return `${normalized}.zig`;
}

function toExternalZigModule(resolvedSourcePath: string): string {
	const workspaceRoot = process.cwd();
	const relPath = path.relative(workspaceRoot, resolvedSourcePath).replace(/\\/g, "/");
	return relPath.replace(/\.(ts|js|mjs|cjs)$/, ".zig");
}

function resolveExternalModuleSource(moduleSpec: string, sourceFilePath: string): string | null {
	try {
		const resolved = require.resolve(moduleSpec, {
			paths: [path.dirname(sourceFilePath), process.cwd()],
		});

		if (!path.isAbsolute(resolved)) {
			return null;
		}

		if (resolved.endsWith(".d.ts")) {
			return null;
		}

		if (!/\.(ts|js|mjs|cjs)$/.test(resolved)) {
			return null;
		}

		if (!fs.existsSync(resolved)) {
			return null;
		}

		return resolved;
	} catch {
		return null;
	}
}

function toModuleAlias(zigModule: string): string {
	return zigModule
		.replace(/\.zig$/, "")
		.replace(/\//g, "_")
		.replace(/[^a-zA-Z0-9_]/g, "_");
}
