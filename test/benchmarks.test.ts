import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runTranspiler } from "../src/compiler";

interface BenchmarkResult {
	name: string;
	bunOutput: string;
	bunTime: number;
	nodeOutput: string;
	nodeTime: number;
	nodeRan: boolean;
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
		const sourcePath = path.join(benchmarkDir, file);
		const zigPath = path.join(zigDir, `${baseName}.zig`);

		console.log(`Testing: ${baseName}`);
		console.log("-".repeat(60));

		try {
			const bunStart = Date.now();
			const bunOutput = execSync(`bun ${sourcePath}`, { encoding: "utf-8" }).trim();
			const bunTime = Date.now() - bunStart;
			console.log(`Bun: ${bunTime}ms`);

			let nodeOutput = "";
			let nodeTime = 0;
			let nodeRan = false;

			const nodeVersion = spawnSync("node", ["--version"], { encoding: "utf-8" });
			if (nodeVersion.status === 0) {
				const nodeOutFile = path.join(os.tmpdir(), `ts2zig-bench-${baseName}-${Date.now()}.mjs`);
				const buildResult = spawnSync(
					"bun",
					["build", sourcePath, "--target=node", "--format=esm", "--outfile", nodeOutFile],
					{ encoding: "utf-8" }
				);

				if (buildResult.status !== 0) {
					console.log(`Node Build Error: ${buildResult.stderr}`);
					console.log();
					continue;
				}

				const nodeStart = Date.now();
				const nodeResult = spawnSync("node", [nodeOutFile], { encoding: "utf-8" });
				nodeTime = Date.now() - nodeStart;
				try {
					fs.unlinkSync(nodeOutFile);
				} catch { }

				if (nodeResult.status !== 0) {
					console.log(`Node Error: ${nodeResult.stderr}`);
					console.log();
					continue;
				}

				nodeOutput = `${nodeResult.stdout ?? ""}${nodeResult.stderr ?? ""}`.trim();
				nodeRan = true;
				console.log(`Node: ${nodeTime}ms`);
			} else {
				console.log("Node: N/A");
			}

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

			const zigOutput = `${zigResult.stderr ?? ""}${zigResult.stdout ?? ""}`.trim();
			console.log(`Zig: ${zigTime}ms`);

			// Normalize and compare outputs
			const bunNormalized = bunOutput.toLowerCase().trim();
			const nodeNormalized = nodeOutput.toLowerCase().trim();
			const zigNormalized = zigOutput.toLowerCase().trim();
			const match = nodeRan
				? bunNormalized === zigNormalized && nodeNormalized === zigNormalized
				: bunNormalized === zigNormalized;

			console.log(`Match: ${match ? "YES" : "NO"}`);
			if (!match) {
				console.log(`\nBun output:\n${bunOutput}`);
				if (nodeRan) {
					console.log(`\nNode output:\n${nodeOutput}`);
				}
				console.log(`\nZig output:\n${zigOutput}\n`);
			}

			const speedup = bunTime / zigTime;
			console.log(`Bun->Zig Speedup: ${speedup.toFixed(2)}x`);

			results.push({
				name: baseName,
				bunOutput,
				bunTime,
				nodeOutput,
				nodeTime,
				nodeRan,
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
		"Bun".padEnd(12) +
		"Node".padEnd(12) +
		"Zig".padEnd(15) +
		"Bun->Zig".padEnd(10) +
		"Match"
	);
	console.log("-".repeat(84));

	let totalBun = 0;
	let totalNode = 0;
	let nodeCount = 0;
	let totalZig = 0;
	let matchCount = 0;

	for (const result of results) {
		totalBun += result.bunTime;
		if (result.nodeRan) {
			totalNode += result.nodeTime;
			nodeCount++;
		}
		totalZig += result.zigTime;
		if (result.match) matchCount++;

		const speedup = result.bunTime / result.zigTime;
		const matchStr = result.match ? "YES" : "NO";
		const nodeCell = result.nodeRan ? `${result.nodeTime}ms` : "N/A";

		console.log(
			result.name.padEnd(20) +
			`${result.bunTime}ms`.padEnd(12) +
			nodeCell.padEnd(12) +
			`${result.zigTime}ms`.padEnd(15) +
			`${speedup.toFixed(2)}x`.padEnd(10) +
			matchStr
		);
	}

	console.log("-".repeat(84));
	const totalSpeedup = totalBun / totalZig;
	const failedCount = results.length - matchCount;
	const totalNodeCell = nodeCount > 0 ? `${totalNode}ms` : "N/A";
	console.log(
		"TOTAL".padEnd(20) +
		`${totalBun}ms`.padEnd(12) +
		totalNodeCell.padEnd(12) +
		`${totalZig}ms`.padEnd(15) +
		`${totalSpeedup.toFixed(2)}x`.padEnd(10) +
		`${matchCount}/${results.length}`
	);
	console.log(`pass: ${matchCount}`);
	console.log(`failed: ${failedCount}`);

	console.log("\n");
}

// Transpile benchmarks first
console.log("Transpiling benchmarks...");
const benchmarkDir = path.join(process.cwd(), "test", "benchmark");
const benchmarkOutDir = path.join(process.cwd(), "out", "benchmark");
runTranspiler(benchmarkDir, benchmarkOutDir);
runBenchmarks();
