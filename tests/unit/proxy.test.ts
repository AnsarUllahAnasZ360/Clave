import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getLegacyWorkspaceRedirectPath } from "../../src/lib/legacy-workspace-redirect";

// The set of top-level routes the proxy must treat as real, non-workspace
// URLs. Mirrored from src/lib/legacy-workspace-redirect.ts. The two are
// asserted in sync below so adding a folder under src/app/ without updating
// the allowlist fails CI rather than 301-redirecting users into oblivion.
const RESERVED_TOP_LEVEL_ROUTES = new Set([
	"admin",
	"api",
	"auth",
	"boot",
	"brand",
	"changelog",
	"dev-login",
	"docs",
	"google-chat",
	"join",
	"onboarding",
	"organizations",
	"share",
	"sign-in",
	"sign-up",
]);

function listAppTopLevelRoutes(): string[] {
	const appDir = join(process.cwd(), "src", "app");
	return readdirSync(appDir).filter((entry) => {
		// Skip route groups (auth), dynamic segments [workspaceSlug], and files.
		if (entry.startsWith("(") || entry.startsWith("[")) return false;
		const fullPath = join(appDir, entry);
		return statSync(fullPath).isDirectory();
	});
}

describe("getLegacyWorkspaceRedirectPath", () => {
	it("redirects legacy org-prefixed workspace routes to workspace-only routes", () => {
		expect(getLegacyWorkspaceRedirectPath("/acme/roadmap/issues/CLV-123")).toBe(
			"/roadmap/issues/CLV-123",
		);
		expect(getLegacyWorkspaceRedirectPath("/acme/roadmap/projects")).toBe(
			"/roadmap/projects",
		);
	});

	it("does not rewrite the bare /{a}/{b} two-segment shape", () => {
		// Two-segment paths are ambiguous: they could be the new
		// /{workspaceSlug}/{route} shape or a real top-level route like
		// /google-chat/setup. We never speculatively rewrite — only multi-segment
		// URLs whose third segment positively identifies them as legacy.
		expect(getLegacyWorkspaceRedirectPath("/acme/roadmap")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/anything/anything")).toBeNull();
	});

	it("does not rewrite reserved top-level routes", () => {
		expect(getLegacyWorkspaceRedirectPath("/share/token")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/docs/getting-started")).toBeNull();
		expect(
			getLegacyWorkspaceRedirectPath("/google-chat/setup/anything"),
		).toBeNull();
	});

	it("does not rewrite already-migrated workspace-only routes", () => {
		expect(
			getLegacyWorkspaceRedirectPath("/roadmap/issues/CLV-123"),
		).toBeNull();
	});

	it("does not rewrite new format workspace/route URLs", () => {
		expect(getLegacyWorkspaceRedirectPath("/dev/chat")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/dev/issues")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/dev/projects")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/dev/settings")).toBeNull();
	});

	it("does not rewrite three-segment paths whose third segment is unknown", () => {
		// `/A/B/X` is only redirected when X is a known workspace route. Anything
		// else stays put — these are normal sub-pages, not legacy URLs.
		expect(getLegacyWorkspaceRedirectPath("/acme/roadmap/random")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/foo/bar/baz")).toBeNull();
	});

	it("does not rewrite concrete top-level app routes", () => {
		for (const route of listAppTopLevelRoutes()) {
			expect(
				getLegacyWorkspaceRedirectPath(`/${route}/probe`),
				`/${route}/probe should not be rewritten as a workspace URL`,
			).toBeNull();
			expect(
				getLegacyWorkspaceRedirectPath(`/${route}/probe/issues`),
				`/${route}/probe/issues should not be rewritten as a workspace URL`,
			).toBeNull();
		}
	});

	it("keeps RESERVED_TOP_LEVEL_ROUTES in sync with src/app folders", () => {
		// CI guardrail: every concrete top-level folder under src/app/ MUST be
		// listed in RESERVED_TOP_LEVEL_ROUTES. Otherwise the proxy will treat
		// the new folder as a legacy /orgSlug and 301-redirect every visit to a
		// workspace that doesn't exist — exactly the bug this branch fixes.
		const missing = listAppTopLevelRoutes().filter(
			(route) => !RESERVED_TOP_LEVEL_ROUTES.has(route),
		);
		expect(
			missing,
			`Add these folders to RESERVED_TOP_LEVEL_ROUTES in src/lib/legacy-workspace-redirect.ts: ${missing.join(", ")}`,
		).toEqual([]);
	});
});
