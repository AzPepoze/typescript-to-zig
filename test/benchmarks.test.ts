import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runTranspiler } from "../src/compiler";

interface BenchmarkResult {
	name: string;
	bunOutput: string;
	bunTime: number;
	bunRssKb: number | null;
	nodeOutput: string;
	nodeTime: number;
	nodeRssKb: number | null;
	nodeRan: boolean;
	zigOutput: string;
	zigTime: number;
	zigRssKb: number | null;
	match: boolean;
}

interface RunMetrics {
	status: number | null;
	stdout: string;
	stderr: string;
	rssKb: number | null;
}

async function runWithMetrics(command: string, args: string[]): Promise<RunMetrics> {
	const directCommand = command === "bun" ? process.execPath : command;

	return await new Promise<RunMetrics>((resolve) => {
		const child = spawn(directCommand, args, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});

		let stdout = "";
		let stderr = "";
		let maxRssKb: number | null = null;

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});

		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});

		const sampleRss = () => {
			if (!child.pid) return;
			const statusPath = `/proc/${child.pid}/status`;
			if (!fs.existsSync(statusPath)) return;
			const statusText = fs.readFileSync(statusPath, "utf-8");
			const hwmMatch = statusText.match(/^VmHWM:\s+(\d+)\s+kB$/m);
			const rssMatch = statusText.match(/^VmRSS:\s+(\d+)\s+kB$/m);
			const current = hwmMatch ? Number(hwmMatch[1]) : (rssMatch ? Number(rssMatch[1]) : null);
			if (current !== null) {
				maxRssKb = maxRssKb === null ? current : Math.max(maxRssKb, current);
			}
		};

		sampleRss();
		const interval = setInterval(sampleRss, 1);

		child.on("error", (err: Error) => {
			clearInterval(interval);
			stderr += err.message;
			resolve({
				status: 1,
				stdout,
				stderr,
				rssKb: maxRssKb,
			});
		});

		child.on("close", (code) => {
			clearInterval(interval);
			resolve({
				status: code,
				stdout,
				stderr,
				rssKb: maxRssKb,
			});
		});
	});
}

async function ensureRssSample(command: string, args: string[], currentRss: number | null): Promise<number | null> {
	if (currentRss !== null) {
		return currentRss;
	}

	let maxRss: number | null = null;
	for (let i = 0; i < 3; i++) {
		const probe = await runWithMetrics(command, args);
		if (probe.status !== 0) {
			break;
		}
		if (probe.rssKb !== null) {
			maxRss = maxRss === null ? probe.rssKb : Math.max(maxRss, probe.rssKb);
		}
	}

	return maxRss;
}

async function runBenchmarks() {
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
	const totalBenchmarks = files.length;

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
			const bunResult = await runWithMetrics("bun", [sourcePath]);
			const bunTime = Date.now() - bunStart;
			if (bunResult.status !== 0) {
				console.log(`Bun Error: ${bunResult.stderr}`);
				console.log();
				continue;
			}
			const bunRssKb = await ensureRssSample("bun", [sourcePath], bunResult.rssKb);
			const bunOutput = `${bunResult.stdout ?? ""}${bunResult.stderr ?? ""}`.trim();
			const bunMemText = bunRssKb !== null ? `, ${bunRssKb}KB` : "";
			console.log(`Bun: ${bunTime}ms${bunMemText}`);

			let nodeOutput = "";
			let nodeTime = 0;
			let nodeRssKb: number | null = null;
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
				const nodeResult = await runWithMetrics("node", [nodeOutFile]);
				nodeTime = Date.now() - nodeStart;
				nodeRssKb = await ensureRssSample("node", [nodeOutFile], nodeResult.rssKb);

				if (nodeResult.status !== 0) {
					console.log(`Node Error: ${nodeResult.stderr}`);
					try {
						fs.unlinkSync(nodeOutFile);
					} catch { }
					console.log();
					continue;
				}
				try {
					fs.unlinkSync(nodeOutFile);
				} catch { }

				nodeOutput = `${nodeResult.stdout ?? ""}${nodeResult.stderr ?? ""}`.trim();
				nodeRan = true;
				const nodeMemText = nodeRssKb !== null ? `, ${nodeRssKb}KB` : "";
				console.log(`Node: ${nodeTime}ms${nodeMemText}`);
			} else {
				console.log("Node: N/A");
			}

			// Run Zig version if it exists
			if (!fs.existsSync(zigPath)) {
				console.log(`Zig file not found: ${zigPath}`);
				console.log();
				continue;
			}

			const zigBinPath = path.join(
				os.tmpdir(),
				`ts2zig-bench-${baseName}-${Date.now()}`
			);
			const zigBuildResult = spawnSync(
				"zig",
				["build-exe", zigPath, `-femit-bin=${zigBinPath}`],
				{ encoding: "utf-8" }
			);
			if (zigBuildResult.status !== 0) {
				console.log(`Zig Build Error: ${zigBuildResult.stderr}`);
				console.log();
				continue;
			}

			const zigStart = Date.now();
			const zigResult = await runWithMetrics(zigBinPath, []);
			const zigTime = Date.now() - zigStart;
			const zigRssKb = await ensureRssSample(zigBinPath, [], zigResult.rssKb);

			if (zigResult.status !== 0) {
				console.log(`Zig Error: ${zigResult.stderr}`);
				try {
					fs.unlinkSync(zigBinPath);
				} catch { }
				console.log();
				continue;
			}
			try {
				fs.unlinkSync(zigBinPath);
			} catch { }

			const zigOutput = `${zigResult.stderr ?? ""}${zigResult.stdout ?? ""}`.trim();
			const zigMemText = zigRssKb !== null ? `, ${zigRssKb}KB` : "";
			console.log(`Zig: ${zigTime}ms${zigMemText}`);

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
				bunRssKb,
				nodeOutput,
				nodeTime,
				nodeRssKb,
				nodeRan,
				zigOutput,
				zigTime,
				zigRssKb,
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
		"Bun(ms)".padEnd(10) +
		"RAM(KB)".padEnd(10) +
		"Node(ms)".padEnd(10) +
		"RAM(KB)".padEnd(10) +
		"Zig(ms)".padEnd(10) +
		"RAM(KB)".padEnd(10) +
		"Bun->Zig".padEnd(10) +
		"Match"
	);
	console.log("-".repeat(100));

	let totalBun = 0;
	let totalBunRss = 0;
	let bunRssCount = 0;
	let totalNode = 0;
	let totalNodeRss = 0;
	let nodeCount = 0;
	let totalZig = 0;
	let totalZigRss = 0;
	let zigRssCount = 0;
	let matchCount = 0;

	for (const result of results) {
		totalBun += result.bunTime;
		if (result.bunRssKb !== null) {
			totalBunRss += result.bunRssKb;
			bunRssCount++;
		}
		if (result.nodeRan) {
			totalNode += result.nodeTime;
			if (result.nodeRssKb !== null) {
				totalNodeRss += result.nodeRssKb;
			}
			nodeCount++;
		}
		totalZig += result.zigTime;
		if (result.zigRssKb !== null) {
			totalZigRss += result.zigRssKb;
			zigRssCount++;
		}
		if (result.match) matchCount++;

		const speedup = result.bunTime / result.zigTime;
		const matchStr = result.match ? "YES" : "NO";
		const bunMemCell = result.bunRssKb !== null ? `${result.bunRssKb}` : "N/A";
		const nodeTimeCell = result.nodeRan ? `${result.nodeTime}` : "N/A";
		const nodeMemCell = result.nodeRan && result.nodeRssKb !== null ? `${result.nodeRssKb}` : (result.nodeRan ? "N/A" : "N/A");
		const zigMemCell = result.zigRssKb !== null ? `${result.zigRssKb}` : "N/A";

		console.log(
			result.name.padEnd(20) +
			`${result.bunTime}`.padEnd(10) +
			bunMemCell.padEnd(10) +
			nodeTimeCell.padEnd(10) +
			nodeMemCell.padEnd(10) +
			`${result.zigTime}`.padEnd(10) +
			zigMemCell.padEnd(10) +
			`${speedup.toFixed(2)}x`.padEnd(10) +
			matchStr
		);
	}

	console.log("-".repeat(100));
	const totalSpeedup = totalBun / totalZig;
	const failedCount = totalBenchmarks - matchCount;
	const avgBunRss = bunRssCount > 0 ? Math.round(totalBunRss / bunRssCount) : null;
	const avgNodeRss = nodeCount > 0 ? Math.round(totalNodeRss / nodeCount) : null;
	const avgZigRss = zigRssCount > 0 ? Math.round(totalZigRss / zigRssCount) : null;
	const totalNodeTime = nodeCount > 0 ? `${totalNode}` : "N/A";
	console.log(
		"TOTAL".padEnd(20) +
		`${totalBun}`.padEnd(10) +
		`${avgBunRss ?? "N/A"}`.padEnd(10) +
		totalNodeTime.padEnd(10) +
		`${avgNodeRss ?? "N/A"}`.padEnd(10) +
		`${totalZig}`.padEnd(10) +
		`${avgZigRss ?? "N/A"}`.padEnd(10) +
		`${totalSpeedup.toFixed(2)}x`.padEnd(10) +
		`${matchCount}/${totalBenchmarks}`
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
await runBenchmarks();
