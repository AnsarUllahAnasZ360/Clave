/**
 * @vitest-environment node
 */

import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "../..");
const policyScriptPath = resolve(projectRoot, "scripts/check-feature-tests.sh");
const tempRepos: string[] = [];

type CommandResult = SpawnSyncReturns<string>;

function run(
	command: string,
	args: string[],
	cwd: string,
	env: Record<string, string | undefined> = {},
): CommandResult {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			...env,
		},
	});
	if (result.error) {
		throw result.error;
	}
	return result;
}

function runOrThrow(
	command: string,
	args: string[],
	cwd: string,
	env: Record<string, string | undefined> = {},
): string {
	const result = run(command, args, cwd, env);
	if (result.status !== 0) {
		throw new Error(
			`Command failed: ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
		);
	}
	return result.stdout.trim();
}

function initGitRepo(repoDir: string): void {
	const initWithBranch = run("git", ["init", "-b", "main"], repoDir);
	if (initWithBranch.status === 0) {
		return;
	}

	runOrThrow("git", ["init"], repoDir);
	runOrThrow("git", ["checkout", "-b", "main"], repoDir);
}

function createFixtureRepo(): { baseRef: string; repoDir: string } {
	const repoDir = mkdtempSync(join(tmpdir(), "clave-policy-"));
	tempRepos.push(repoDir);

	initGitRepo(repoDir);
	runOrThrow("git", ["config", "user.name", "Integration Test"], repoDir);
	runOrThrow(
		"git",
		["config", "user.email", "integration@example.com"],
		repoDir,
	);

	mkdirSync(join(repoDir, "src"), { recursive: true });
	mkdirSync(join(repoDir, "tests/unit"), { recursive: true });
	mkdirSync(join(repoDir, "tests/integration"), { recursive: true });

	writeFileSync(
		join(repoDir, "src/feature.ts"),
		"export const featureVersion = 1;\n",
	);
	writeFileSync(
		join(repoDir, "tests/unit/feature.test.ts"),
		'export const unitMarker = "base";\n',
	);
	writeFileSync(
		join(repoDir, "tests/integration/feature.integration.test.ts"),
		'export const integrationMarker = "base";\n',
	);

	runOrThrow("git", ["add", "."], repoDir);
	runOrThrow("git", ["commit", "-m", "baseline"], repoDir);

	const baseRef = runOrThrow("git", ["rev-parse", "HEAD"], repoDir);
	return { baseRef, repoDir };
}

function commitFeatureChange(
	repoDir: string,
	options: { updateIntegration: boolean; updateUnit: boolean },
): void {
	writeFileSync(
		join(repoDir, "src/feature.ts"),
		"export const featureVersion = 2;\n",
	);

	if (options.updateUnit) {
		writeFileSync(
			join(repoDir, "tests/unit/feature.test.ts"),
			'export const unitMarker = "updated";\n',
		);
	}

	if (options.updateIntegration) {
		writeFileSync(
			join(repoDir, "tests/integration/feature.integration.test.ts"),
			'export const integrationMarker = "updated";\n',
		);
	}

	runOrThrow("git", ["add", "."], repoDir);
	runOrThrow("git", ["commit", "-m", "feature update"], repoDir);
}

function runPolicy(repoDir: string, baseRef: string): CommandResult {
	return run("bash", [policyScriptPath], repoDir, { BASE_REF: baseRef });
}

afterEach(() => {
	for (const repoDir of tempRepos.splice(0)) {
		rmSync(repoDir, { force: true, recursive: true });
	}
});

describe("scripts/check-feature-tests.sh", () => {
	it("fails when feature changes are missing integration updates", () => {
		const { baseRef, repoDir } = createFixtureRepo();
		commitFeatureChange(repoDir, {
			updateIntegration: false,
			updateUnit: true,
		});

		const result = runPolicy(repoDir, baseRef);
		const output = `${result.stdout}\n${result.stderr}`;

		expect(result.status).toBe(1);
		expect(output).toContain(
			"[policy] FAIL: feature changes require integration test updates.",
		);
	});

	it("passes when feature changes include unit and integration updates", () => {
		const { baseRef, repoDir } = createFixtureRepo();
		commitFeatureChange(repoDir, {
			updateIntegration: true,
			updateUnit: true,
		});

		const result = runPolicy(repoDir, baseRef);
		const output = `${result.stdout}\n${result.stderr}`;

		expect(result.status).toBe(0);
		expect(output).toContain(
			"[policy] PASS: feature changes include required test updates (unit + integration).",
		);
	});
});
