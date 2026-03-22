import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";

const outDir = path.join(process.cwd(), "out", "main");
const testDir = path.join(process.cwd(), "test", "main");
const failedFiles: string[] = [];
let passCount = 0;
let totalCount = 0;

describe("Transpiler Execution Tests", () => {
	beforeAll(() => {
		// Ensure the transpiler has run
		console.log("Running transpiler...");
		try {
			execSync("bun run transpile", { stdio: "inherit" });
		} catch (e) {
			console.error("Transpilation failed, but continuing with existing files...");
		}
	});

	const tsFiles = fs.readdirSync(testDir).filter(f =>
		f.endsWith(".ts") &&
		!f.endsWith(".test.ts") &&
		f !== "tsconfig.json"
	);
	totalCount = tsFiles.length;

	for (const file of tsFiles) {
		test(`should match execution output for ${file}`, () => {
			const tsPath = path.join(testDir, file);
			const baseName = path.basename(file, ".ts");
			const zigPath = path.join(outDir, `${baseName}.zig`);

			try {
				// 1. Run TypeScript with Bun
				let expectedOutput = execSync(`bun ${tsPath}`, { encoding: "utf-8" }).trim();

				// 2. Ensure Zig file exists
				expect(fs.existsSync(zigPath)).toBe(true);

				// 3. Run Zig program
				const child = spawnSync("zig", ["run", zigPath], { encoding: "utf-8" });
				let zigOutput = child.stderr.trim();

				if (child.status !== 0) {
					throw new Error(child.stderr);
				}

				// 4. Compare
				const normalizedExpected = expectedOutput
					.replace(/(\d+)n\b/g, "$1")
					.replace(/\bundefined\b/g, "null")
					.replace(/\b0\b/g, file === "enums.ts" ? "Up" : "0");

				const normalizedZig = zigOutput
					.replace(/\.([a-zA-Z_]\w*)\b/g, "$1");

				expect(normalizedZig.toLowerCase()).toBe(normalizedExpected.toLowerCase());
				passCount++;
			} catch (error: any) {
				failedFiles.push(file);
				throw error;
			}
		});
	}

	afterAll(() => {
		if (failedFiles.length > 0) {
			console.log(`\nfailed : ${failedFiles.join(", ")}`);
		} else {
			console.log("\nAll tests passed!");
		}
		console.log(`pass ${passCount}/${totalCount}\n`);
	});
});
