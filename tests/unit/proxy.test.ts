import { describe, expect, it } from "vitest";
import { getLegacyWorkspaceRedirectPath } from "../../src/lib/legacy-workspace-redirect";

describe("getLegacyWorkspaceRedirectPath", () => {
	it("redirects legacy org/workspace root URLs to the workspace chat root", () => {
		expect(getLegacyWorkspaceRedirectPath("/acme/roadmap")).toBe(
			"/roadmap/chat",
		);
	});

	it("redirects legacy org-prefixed workspace routes to workspace-only routes", () => {
		expect(
			getLegacyWorkspaceRedirectPath("/acme/roadmap/issues/CLV-123"),
		).toBe("/roadmap/issues/CLV-123");
	});

	it("does not rewrite reserved top-level routes", () => {
		expect(getLegacyWorkspaceRedirectPath("/share/token")).toBeNull();
		expect(getLegacyWorkspaceRedirectPath("/docs/getting-started")).toBeNull();
	});

	it("does not rewrite already-migrated workspace-only routes", () => {
		expect(getLegacyWorkspaceRedirectPath("/roadmap/issues/CLV-123")).toBeNull();
	});
});
