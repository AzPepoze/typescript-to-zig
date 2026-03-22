import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { logger } from "../../utils/logger";
import { registerUnsupportedModule, resolveModuleForZig } from "../module_policy";

interface ResolvedImport {
	moduleAlias: string;
	unsupported: boolean;
}

export function resolveAndRegisterModuleImport(moduleSpec: string, context: TranspilerContext): ResolvedImport {
	const resolved = resolveModuleForZig(moduleSpec, context.sourceFile.fileName);

	if (resolved.kind === "unsupported") {
		context.zigOutput += `${registerUnsupportedModule(moduleSpec, context)}\n`;
		return { moduleAlias: "", unsupported: true };
	}

	if (!context.importedModules.has(resolved.zigModule)) {
		context.importedModules.add(resolved.zigModule);
		context.importAliases.push(resolved.moduleAlias);
		context.zigOutput += `const ${resolved.moduleAlias} = @import("${resolved.zigModule}");\n`;
	}

	if (resolved.kind === "external" && resolved.sourcePath) {
		context.externalModuleSources.set(resolved.zigModule, resolved.sourcePath);
	}

	return { moduleAlias: resolved.moduleAlias, unsupported: false };
}

export function processImportDeclaration(node: ts.ImportDeclaration, context: TranspilerContext) {
	const { sourceFile, checker } = context;
	const moduleSpec = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
	const resolved = resolveAndRegisterModuleImport(moduleSpec, context);
	if (resolved.unsupported) {
		logger.warn(`Unsupported module import: ${moduleSpec}`);
		return;
	}
	const moduleAlias = resolved.moduleAlias;

	if (node.importClause?.name) {
		const name = node.importClause.name.text;
		const symbol = checker.getSymbolAtLocation(node.importClause.name);
		if (symbol) {
			const aliased = checker.getAliasedSymbol(symbol);
			if (aliased) {
				logger.debug(`Aliased symbol: ${aliased.name} -> ${name}`);
				context.typeAliases.set(aliased.name, name);
			}
			const type = checker.getTypeAtLocation(node.importClause.name);
			if (type.symbol) {
				const typeName = type.symbol.name;
				if (typeName === "default") {
					const tStr = checker.typeToString(type);
					const cleanType = tStr.startsWith("typeof ") ? tStr.substring(7) : tStr;
					if (cleanType !== "default" && cleanType !== "any") {
						context.typeAliases.set(cleanType, name);
					}

					if (type.symbol.flags & ts.SymbolFlags.Alias) {
						const aliasedChild = checker.getAliasedSymbol(type.symbol);
						if (aliasedChild && aliasedChild.name !== "default") {
							context.typeAliases.set(aliasedChild.name, name);
						}
					}
				} else {
					context.typeAliases.set(typeName, name);
				}
			}
		}
		context.zigOutput += `const ${name} = ${moduleAlias}.Default;\n`;
	}

	if (node.importClause?.namedBindings) {
		if (ts.isNamedImports(node.importClause.namedBindings)) {
			node.importClause.namedBindings.elements.forEach((element: ts.ImportSpecifier) => {
				const name = element.name.text;
				const importedName = element.propertyName?.text ?? name;
				const symbol = checker.getSymbolAtLocation(element.name);
				if (symbol) {
					const aliased = checker.getAliasedSymbol(symbol);
					if (aliased) context.typeAliases.set(aliased.name, name);
				}
				context.zigOutput += `const ${name} = ${moduleAlias}.${importedName};\n`;
			});
		} else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
			const namespaceName = node.importClause.namedBindings.name.text;
			context.zigOutput += `const ${namespaceName} = ${moduleAlias};\n`;
		}
	}
}
