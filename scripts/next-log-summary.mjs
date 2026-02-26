#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let logFile = ".next/dev/logs/next-development.log";
let top = 15;
let tailLines = 0;

for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg === "--file" || arg === "-f") {
		logFile = args[index + 1] ?? logFile;
		index += 1;
		continue;
	}
	if (arg === "--top" || arg === "-n") {
		const parsed = Number(args[index + 1]);
		if (Number.isFinite(parsed) && parsed > 0) {
			top = Math.floor(parsed);
		}
		index += 1;
		continue;
	}
	if (arg === "--tail" || arg === "-t") {
		const parsed = Number(args[index + 1]);
		if (Number.isFinite(parsed) && parsed > 0) {
			tailLines = Math.floor(parsed);
		}
		index += 1;
		continue;
	}
	if (arg === "--help" || arg === "-h") {
		console.log(
			[
				"Usage: node scripts/next-log-summary.mjs [--file <path>] [--top <count>]",
				"       node scripts/next-log-summary.mjs [--tail <lines>]",
				"",
				"Examples:",
				"  node scripts/next-log-summary.mjs",
				"  node scripts/next-log-summary.mjs --top 25",
				"  node scripts/next-log-summary.mjs --tail 400",
				"  node scripts/next-log-summary.mjs --file .next/dev/logs/next-development.log",
			].join("\n"),
		);
		process.exit(0);
	}
}

const resolvedLogFile = path.resolve(process.cwd(), logFile);
if (!fs.existsSync(resolvedLogFile)) {
	console.error(`Log file not found: ${resolvedLogFile}`);
	process.exit(1);
}

const text = fs.readFileSync(resolvedLogFile, "utf8");
const allLines = text.split(/\r?\n/).filter(Boolean);
const lines = tailLines > 0 ? allLines.slice(-tailLines) : allLines;

/** @param {Map<string, number>} map */
function increment(map, key) {
	map.set(key, (map.get(key) ?? 0) + 1);
}

/** @param {Map<string, number>} map */
function sortedEntries(map) {
	return [...map.entries()].sort((left, right) => right[1] - left[1]);
}

/** @param {Map<string, number>} map */
function printTopMap(title, map) {
	console.log(`\n${title}`);
	const entries = sortedEntries(map).slice(0, top);
	if (entries.length === 0) {
		console.log("  (none)");
		return;
	}
	for (const [key, count] of entries) {
		console.log(`  ${String(count).padStart(5, " ")}  ${key}`);
	}
}

const explicitMethodCounts = new Map();
const explicitMethodPathCounts = new Map();
const middlewarePathCounts = new Map();
const webVitalsPathCounts = new Map();
let webVitalsEvents = 0;

for (const line of lines) {
	const methodMatch = line.match(
		/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+([^\s"]+)/,
	);
	if (methodMatch) {
		const method = methodMatch[1];
		const requestPath = methodMatch[2];
		increment(explicitMethodCounts, method);
		increment(explicitMethodPathCounts, `${method} ${requestPath}`);
	}

	const middlewareMatch = line.match(
		/Begin middleware for request with URL\s+https?:\/\/[^/]+([^\s]+)/,
	);
	if (middlewareMatch) {
		increment(middlewarePathCounts, middlewareMatch[1]);
	}

	if (line.includes("Server  INFO    web-vitals")) {
		webVitalsEvents += 1;
		const pathMatch =
			line.match(/"path":"([^"]+)"/) ??
			line.match(/\\"path\\":\\"([^\\"]+)\\"/);
		if (pathMatch) {
			increment(webVitalsPathCounts, pathMatch[1]);
		}
	}
}

console.log(`Next.js log summary: ${resolvedLogFile}`);
console.log(
	`Analyzed lines: ${lines.length}${tailLines > 0 ? ` (tail of ${allLines.length})` : ""}`,
);

printTopMap(
	"HTTP methods (explicit request lines only):",
	explicitMethodCounts,
);
printTopMap(
	"Top explicit method+path request pairs:",
	explicitMethodPathCounts,
);
printTopMap("Top proxy middleware path hits:", middlewarePathCounts);
printTopMap(
	"Top web-vitals payload paths (inferred POST /api/web-vitals):",
	webVitalsPathCounts,
);

console.log("\nInferred counts:");
console.log(`  POST /api/web-vitals  ${webVitalsEvents}`);
