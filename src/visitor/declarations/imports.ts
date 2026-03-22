import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { logger } from "../../utils/logger";

export function processImportDeclaration(node: ts.ImportDeclaration, context: TranspilerContext) {
	const { sourceFile, checker } = context;
	const moduleSpec = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
	const zigModule = moduleSpec.replace(/^\.\//, "").replace(/\.ts$/, "") + ".zig";
	const moduleAlias = zigModule.replace(/\.zig$/, "").replace(/\//g, "_").replace(/[^a-zA-Z0-9_]/g, "_");

	if (!context.importedModules) context.importedModules = new Set();

	if (!context.importedModules.has(zigModule)) {
		context.importedModules.add(zigModule);
		context.importAliases.push(moduleAlias);
		context.zigOutput += `const ${moduleAlias} = @import("${zigModule}");\n`;
	}

	if (node.importClause && node.importClause.namedBindings) {
		if (ts.isNamedImports(node.importClause.namedBindings)) {
			node.importClause.namedBindings.elements.forEach((element: ts.ImportSpecifier) => {
				const name = element.name.text;
				const symbol = checker.getSymbolAtLocation(element.name);
				if (symbol) {
					const aliased = checker.getAliasedSymbol(symbol);
					if (aliased) context.typeAliases.set(aliased.name, name);
				}
				context.zigOutput += `const ${name} = ${moduleAlias}.${name};\n`;
			});
		}
	} else if (node.importClause && node.importClause.name) {
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
}
