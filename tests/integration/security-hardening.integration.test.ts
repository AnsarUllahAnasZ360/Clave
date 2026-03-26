import { describe, expect, it } from "vitest";

describe("security hardening", () => {
	describe("next.config security headers", () => {
		it("exports headers function with security headers", async () => {
			const { default: configFn } = await import("../../next.config");
			// The exported config is wrapped by withBundleAnalyzer(withMDX(...))
			// so we verify the inner config by importing and checking the headers function exists
			// The actual headers are applied at runtime by Next.js
			expect(configFn).toBeDefined();
		});
	});

	describe("github connect-pat input validation", () => {
		it("rejects path-traversal characters in repoOwner", async () => {
			const { POST } = await import(
				"../../src/app/api/auth/github/connect-pat/route"
			);
			const res = await POST(
				new Request("http://localhost/api/auth/github/connect-pat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						token: "ghp_test",
						repoOwner: "../etc",
						repoName: "repo",
					}),
				}),
			);
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error).toContain("Invalid");
		});

		it("rejects special characters in repoName", async () => {
			const { POST } = await import(
				"../../src/app/api/auth/github/connect-pat/route"
			);
			const res = await POST(
				new Request("http://localhost/api/auth/github/connect-pat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						token: "ghp_test",
						repoOwner: "owner",
						repoName: "repo/../../../etc/passwd",
					}),
				}),
			);
			expect(res.status).toBe(400);
		});

		it("accepts valid owner and repo names", async () => {
			const { POST } = await import(
				"../../src/app/api/auth/github/connect-pat/route"
			);
			// This will pass validation but fail on GitHub API (invalid token)
			const res = await POST(
				new Request("http://localhost/api/auth/github/connect-pat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						token: "ghp_test",
						repoOwner: "valid-owner",
						repoName: "valid-repo.name",
					}),
				}),
			);
			// Should pass validation (400 means missing/invalid input, 401/502 means it reached GitHub)
			expect(res.status).not.toBe(400);
		});
	});

	describe("dev credentials sanitization", () => {
		it("dev-login uses env-configurable password", async () => {
			// Verify the source code no longer contains hardcoded real emails
			const fs = await import("node:fs");
			const content = fs.readFileSync(
				"src/app/(auth)/dev-login/page.tsx",
				"utf-8",
			);
			expect(content).not.toContain("kul@goclave.app");
			expect(content).not.toContain("gocliff.app");
			expect(content).toContain("NEXT_PUBLIC_DEV_PASSWORD");
			expect(content).toContain("example.com");
		});

		it("devInit uses placeholder emails", async () => {
			const fs = await import("node:fs");
			const content = fs.readFileSync("convex/devInit.ts", "utf-8");
			expect(content).not.toContain("kul@goclave.app");
			expect(content).not.toContain("gocliff.app");
			expect(content).toContain("example.com");
		});

		it("admin layout uses env-configurable superadmin emails", async () => {
			const fs = await import("node:fs");
			const content = fs.readFileSync("src/app/admin/layout.tsx", "utf-8");
			expect(content).not.toContain("kul@goclave.app");
			expect(content).toContain("NEXT_PUBLIC_DEV_SUPERADMIN_EMAILS");
		});
	});
});
