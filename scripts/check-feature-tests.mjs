#!/usr/bin/env node
/**
 * Feature test policy: require unit + integration test updates when src/ or convex/ changes.
 * Invoked by `bun run test:policy` and scripts/check-feature-tests.sh (thin wrapper).
 */
import { execFileSync } from "node:child_process";

function git(cwd, args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trimEnd();
}

function gitQuiet(cwd, args) {
	try {
		execFileSync("git", args, { cwd, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function gitOrEmpty(cwd, args) {
	try {
		return git(cwd, args);
	} catch {
		return "";
	}
}

function resolveBaseRef(cwd) {
	if (process.env.BASE_REF) {
		return process.env.BASE_REF;
	}
	if (process.env.GITHUB_BASE_REF) {
		return `origin/${process.env.GITHUB_BASE_REF}`;
	}
	if (
		gitQuiet(cwd, [
			"show-ref",
			"--verify",
			"--quiet",
			"refs/remotes/origin/main",
		])
	) {
		return "origin/main";
	}
	if (gitQuiet(cwd, ["show-ref", "--verify", "--quiet", "refs/heads/main"])) {
		return "main";
	}
	return "HEAD~1";
}

function matchesIntegrationOnly(file) {
	return (
		file.startsWith("tests/integration/") ||
		/\.integration\.test\.tsx?$/.test(file) ||
		/\.integration\.spec\.tsx?$/.test(file) ||
		/\.integration\.spec\.js$/.test(file) ||
		file.startsWith("tests/e2e/") ||
		/\.e2e\.tsx?$/.test(file) ||
		/\.e2e\.js$/.test(file)
	);
}

function matchesUnit(file) {
	if (matchesIntegrationOnly(file)) {
		return false;
	}
	return (
		file.startsWith("tests/unit/") ||
		/\.unit\.test\.tsx?$/.test(file) ||
		/\.unit\.spec\.tsx?$/.test(file) ||
		/\.unit\.spec\.js$/.test(file) ||
		/\.test\.tsx?$/.test(file) ||
		/\.test\.js$/.test(file) ||
		/\.spec\.tsx?$/.test(file) ||
		/\.spec\.js$/.test(file)
	);
}

function matchesIntegrationChanged(file) {
	return (
		file.startsWith("tests/integration/") ||
		/\.integration\.test\.tsx?$/.test(file) ||
		/\.integration\.spec\.tsx?$/.test(file) ||
		/\.integration\.spec\.js$/.test(file)
	);
}

function isFeatureFile(file) {
	if (file.startsWith("src/") || file.startsWith("convex/")) {
		if (file.startsWith("convex/_generated/")) {
			return false;
		}
		return true;
	}
	return false;
}

function main() {
	const cwd = process.cwd();
	const baseRef = resolveBaseRef(cwd);

	try {
		git(cwd, ["rev-parse", "--verify", baseRef]);
	} catch {
		console.error(
			`[policy] FAIL: unable to resolve base ref '${baseRef}'. Set BASE_REF explicitly.`,
		);
		process.exit(1);
	}

	let mergeBase = gitOrEmpty(cwd, ["merge-base", baseRef, "HEAD"]);
	if (!mergeBase) {
		mergeBase = baseRef;
	}

	const changedFiles = git(cwd, ["diff", "--name-only", `${mergeBase}...HEAD`])
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	if (changedFiles.length === 0) {
		console.log(`[policy] PASS: no changed files detected against ${baseRef}.`);
		process.exit(0);
	}

	let featureChanged = false;
	let unitChanged = false;
	let integrationChanged = false;

	for (const file of changedFiles) {
		if (isFeatureFile(file)) {
			featureChanged = true;
		}
		if (matchesUnit(file)) {
			unitChanged = true;
		}
		if (matchesIntegrationChanged(file)) {
			integrationChanged = true;
		}
	}

	if (!featureChanged) {
		console.log("[policy] PASS: no feature files changed in src/ or convex/.");
		process.exit(0);
	}

	let failed = false;
	if (!unitChanged) {
		console.error("[policy] FAIL: feature changes require unit test updates.");
		failed = true;
	}
	if (!integrationChanged) {
		console.error(
			"[policy] FAIL: feature changes require integration test updates.",
		);
		failed = true;
	}

	if (failed) {
		console.error("[policy] Changed files:");
		for (const f of changedFiles) {
			console.error(` - ${f}`);
		}
		process.exit(1);
	}

	console.log(
		"[policy] PASS: feature changes include required test updates (unit + integration).",
	);
	process.exit(0);
}

main();
