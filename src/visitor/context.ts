import * as ts from "typescript";

export interface TranspilerContext {
	zigOutput: string;
	mainBody: string;
	sourceFile: ts.SourceFile;
	checker: ts.TypeChecker;
	importedModules: Set<string>;
	unsupportedModules: Set<string>;
	externalModuleSources: Map<string, string>;
	diagnostics: string[];
	typeAliases: Map<string, string>;
	importAliases: string[];
	globalNames: Set<string>;
	identifierScopes: Map<string, string>[];
	catchBlockBody?: string;
	catchVarName?: string;
}

export type Visitor = (node: ts.Node) => void;

export function pushIdentifierScope(context: TranspilerContext) {
	context.identifierScopes.push(new Map());
}

export function popIdentifierScope(context: TranspilerContext) {
	if (context.identifierScopes.length > 1) {
		context.identifierScopes.pop();
	}
}

export function registerIdentifierAlias(context: TranspilerContext, originalName: string, emittedName: string) {
	if (originalName === emittedName) return;
	const scope = context.identifierScopes[context.identifierScopes.length - 1];
	scope.set(originalName, emittedName);
}

export function resolveIdentifierName(context: TranspilerContext, name: string): string {
	for (let i = context.identifierScopes.length - 1; i >= 0; i--) {
		const renamed = context.identifierScopes[i].get(name);
		if (renamed) return renamed;
	}
	return name;
}

export function makeNonShadowingName(context: TranspilerContext, baseName: string): string {
	if (!context.globalNames.has(baseName)) return baseName;
	let index = 1;
	let candidate = `${baseName}_${index}`;
	while (context.globalNames.has(candidate)) {
		index += 1;
		candidate = `${baseName}_${index}`;
	}
	return candidate;
}
