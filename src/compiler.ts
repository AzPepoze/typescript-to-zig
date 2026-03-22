import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { createVisitor } from "./visitor/index";
import { TranspilerContext } from "./visitor/context";
import { logger } from "./utils/logger";
import { createDefaultZigPrelude } from "./constants";

export function runTranspiler(testDir: string, outDir: string) {
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir);
	}

	const externalModuleSources = new Map<string, string>();
	const transpiledExternalModules = new Set<string>();

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
		const needsMapHelper = fileNeedsMapHelper(sourceFile);
		const context: TranspilerContext = {
			zigOutput: createDefaultZigPrelude(file, { includeMapHelper: needsMapHelper }),
			mainBody: "",
			sourceFile,
			checker,
			importedModules: new Set(),
			unsupportedModules: new Set(),
			externalModuleSources: new Map<string, string>(),
			diagnostics: [],
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
		for (const [zigModule, sourcePath] of context.externalModuleSources.entries()) {
			externalModuleSources.set(zigModule, sourcePath);
		}
		for (const diagnostic of context.diagnostics) {
			logger.warn(`${file}: ${diagnostic}`);
		}
		try {
			require("child_process").execSync(`zig fmt ${outPath}`, { stdio: "ignore" });
		} catch (e) {
			logger.warn(`Failed to format ${outPath}`);
		}
		logger.info(`Transpiled ${file} -> out/${baseName}.zig`);
	}

	transpileExternalModules(outDir, externalModuleSources, transpiledExternalModules);
}

function transpileExternalModules(
	outDir: string,
	externalModuleSources: Map<string, string>,
	transpiledExternalModules: Set<string>
) {
	let pending = true;
	while (pending) {
		pending = false;
		for (const [zigModule, sourcePath] of externalModuleSources.entries()) {
			if (transpiledExternalModules.has(zigModule)) continue;

			const sourceProgram = ts.createProgram([sourcePath], {
				strict: true,
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext,
				allowJs: true,
				checkJs: false,
			});
			const sourceFile = sourceProgram.getSourceFile(sourcePath);
			if (!sourceFile) {
				logger.warn(`Failed to load external module source: ${sourcePath}`);
				transpiledExternalModules.add(zigModule);
				continue;
			}

			const checker = sourceProgram.getTypeChecker();
			const context: TranspilerContext = {
				zigOutput: createDefaultZigPrelude(path.basename(sourcePath), { includeMapHelper: fileNeedsMapHelper(sourceFile) }),
				mainBody: "",
				sourceFile,
				checker,
				importedModules: new Set(),
				unsupportedModules: new Set(),
				externalModuleSources: new Map<string, string>(),
				diagnostics: [],
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

			const outPath = path.join(outDir, zigModule);
			const outDirPath = path.dirname(outPath);
			if (!fs.existsSync(outDirPath)) {
				fs.mkdirSync(outDirPath, { recursive: true });
			}
			fs.writeFileSync(outPath, context.zigOutput);
			try {
				require("child_process").execSync(`zig fmt ${outPath}`, { stdio: "ignore" });
			} catch {
				logger.warn(`Failed to format ${outPath}`);
			}

			for (const [nextZigModule, nextSourcePath] of context.externalModuleSources.entries()) {
				if (!externalModuleSources.has(nextZigModule)) {
					externalModuleSources.set(nextZigModule, nextSourcePath);
					pending = true;
				}
			}
			for (const diagnostic of context.diagnostics) {
				logger.warn(`${sourcePath}: ${diagnostic}`);
			}

			transpiledExternalModules.add(zigModule);
			logger.info(`Transpiled external module ${sourcePath} -> ${zigModule}`);
		}
	}
}

function fileNeedsMapHelper(sourceFile: ts.SourceFile): boolean {
	let needsMap = false;
	const visit = (node: ts.Node) => {
		if (needsMap) return;
		if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === "Map") {
			needsMap = true;
			return;
		}
		if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Map") {
			needsMap = true;
			return;
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return needsMap;
}
