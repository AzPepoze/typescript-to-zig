import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { runTranspiler } from "../src/compiler";

interface BenchmarkResult {
	name: string;
	tsOutput: string;
	tsTime: number;
	zigOutput: string;
	zigTime: number;
	match: boolean;
}

function runBenchmarks() {
	const benchmarkDir = path.join(process.cwd(), "test", "benchmark");
	const zigDir = path.join(process.cwd(), "out", "benchmark");

	const results: BenchmarkResult[] = [];

	// Get all benchmark .ts files
	const files = fs
		.readdirSync(benchmarkDir)
		.filter(
			(f) =>
				f.endsWith(".ts") &&
				f !== "interfaces.ts" &&
				f !== "utils.ts" &&
				f !== "comparable-number.ts"
		);

	console.log("\n================================================================");
	console.log("BENCHMARK EXECUTION");
	console.log("================================================================\n");

	for (const file of files) {
		const baseName = path.basename(file, ".ts");
		const tsPath = path.join(benchmarkDir, file);
		const zigPath = path.join(zigDir, `${baseName}.zig`);

		console.log(`Testing: ${baseName}`);
		console.log("-".repeat(60));

		try {
			// Run TypeScript version
			const tsStart = Date.now();
			const tsOutput = execSync(`bun ${tsPath}`, { encoding: "utf-8" }).trim();
			const tsTime = Date.now() - tsStart;
			console.log(`TypeScript (Bun): ${tsTime}ms`);

			// Run Zig version if it exists
			if (!fs.existsSync(zigPath)) {
				console.log(`Zig file not found: ${zigPath}`);
				console.log();
				continue;
			}

			const zigStart = Date.now();
			const zigResult = spawnSync("zig", ["run", zigPath], {
				encoding: "utf-8",
			});
			const zigTime = Date.now() - zigStart;

			if (zigResult.status !== 0) {
				console.log(`Zig Error: ${zigResult.stderr}`);
				console.log();
				continue;
			}

			const zigOutput = zigResult.stdout.trim();
			console.log(`Zig: ${zigTime}ms`);

			// Normalize and compare outputs
			const tsNormalized = tsOutput.toLowerCase().trim();
			const zigNormalized = zigOutput.toLowerCase().trim();
			const match = tsNormalized === zigNormalized;

			console.log(`Match: ${match ? "YES" : "NO"}`);
			if (!match) {
				console.log(`\nTypeScript output:\n${tsOutput}`);
				console.log(`\nZig output:\n${zigOutput}\n`);
			}

			const speedup = tsTime / zigTime;
			console.log(`Speedup: ${speedup.toFixed(2)}x`);

			results.push({
				name: baseName,
				tsOutput,
				tsTime,
				zigOutput,
				zigTime,
				match,
			});
		} catch (error: any) {
			console.log(`Error: ${error.message}`);
		}
		console.log();
	}

	// Summary
	console.log("================================================================");
	console.log("SUMMARY");
	console.log("================================================================\n");

	console.log(
		"Benchmark".padEnd(20) +
		"TypeScript".padEnd(15) +
		"Zig".padEnd(15) +
		"Speedup".padEnd(10) +
		"Match"
	);
	console.log("-".repeat(75));

	let totalTs = 0;
	let totalZig = 0;
	let matchCount = 0;

	for (const result of results) {
		totalTs += result.tsTime;
		totalZig += result.zigTime;
		if (result.match) matchCount++;

		const speedup = result.tsTime / result.zigTime;
		const matchStr = result.match ? "YES" : "NO";

		console.log(
			result.name.padEnd(20) +
			`${result.tsTime}ms`.padEnd(15) +
			`${result.zigTime}ms`.padEnd(15) +
			`${speedup.toFixed(2)}x`.padEnd(10) +
			matchStr
		);
	}

	console.log("-".repeat(75));
	const totalSpeedup = totalTs / totalZig;
	console.log(
		"TOTAL".padEnd(20) +
		`${totalTs}ms`.padEnd(15) +
		`${totalZig}ms`.padEnd(15) +
		`${totalSpeedup.toFixed(2)}x`.padEnd(10) +
		`${matchCount}/${results.length}`
	);

	console.log("\n");
}

// Transpile benchmarks first
console.log("Transpiling benchmarks...");
const benchmarkDir = path.join(process.cwd(), "test", "benchmark");
const benchmarkOutDir = path.join(process.cwd(), "out", "benchmark");
runTranspiler(benchmarkDir, benchmarkOutDir);
runBenchmarks();
