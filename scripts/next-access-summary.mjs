#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let logFile = ".dev/next-access.log";
let top = 20;
let tailLines = 0;
let stripQuery = false;

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
	if (arg === "--strip-query") {
		stripQuery = true;
		continue;
	}
	if (arg === "--help" || arg === "-h") {
		console.log(
			[
				"Usage: node scripts/next-access-summary.mjs [--file <path>] [--top <count>] [--tail <lines>] [--strip-query]",
				"",
				"Examples:",
				"  node scripts/next-access-summary.mjs",
				"  node scripts/next-access-summary.mjs --tail 500 --top 10",
				"  node scripts/next-access-summary.mjs --strip-query",
				"  node scripts/next-access-summary.mjs --file .dev/next-access.log",
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

const methodCounts = new Map();
const methodPathCounts = new Map();
const statusCounts = new Map();

let matchedRequestLines = 0;

for (const line of lines) {
	const requestMatch = line.match(
		/^\s*(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)\s+(\d{3})\s+in\s+/,
	);
	if (!requestMatch) continue;

	matchedRequestLines += 1;
	const method = requestMatch[1];
	const rawPath = requestMatch[2];
	const status = requestMatch[3];
	const requestPath = stripQuery ? rawPath.split("?")[0] : rawPath;

	increment(methodCounts, method);
	increment(methodPathCounts, `${method} ${requestPath}`);
	increment(statusCounts, status);
}

console.log(`Next.js access summary: ${resolvedLogFile}`);
console.log(
	`Analyzed lines: ${lines.length}${tailLines > 0 ? ` (tail of ${allLines.length})` : ""}`,
);
console.log(`Matched request log lines: ${matchedRequestLines}`);

printTopMap("HTTP methods:", methodCounts);
printTopMap("HTTP status codes:", statusCounts);
printTopMap("Top method + path:", methodPathCounts);
