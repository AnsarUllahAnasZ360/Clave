import { describe, expect, it } from "vitest";
import {
	buildAuthCallbackRedirect,
	DEFAULT_POST_LOGIN_REDIRECT,
	sanitizeInternalRedirect,
} from "../../src/lib/auth/redirect";

describe("sanitizeInternalRedirect", () => {
	it("falls back to auth callback when redirect is missing", () => {
		expect(sanitizeInternalRedirect(undefined)).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
		expect(sanitizeInternalRedirect(null)).toBe(DEFAULT_POST_LOGIN_REDIRECT);
	});

	it("keeps safe in-app paths with query and hash", () => {
		expect(
			sanitizeInternalRedirect("/org/workspace/projects?tab=backlog#section-2"),
		).toBe("/org/workspace/projects?tab=backlog#section-2");
	});

	it("blocks absolute URLs to other origins", () => {
		expect(sanitizeInternalRedirect("https://evil.example/phish")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
		expect(sanitizeInternalRedirect("http://evil.example/phish")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
	});

	it("blocks protocol-relative URLs", () => {
		expect(sanitizeInternalRedirect("//evil.example/phish")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
	});

	it("blocks non-root relative paths", () => {
		expect(sanitizeInternalRedirect("workspace/projects")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
	});

	it("supports custom fallback for invalid redirects", () => {
		expect(sanitizeInternalRedirect("https://evil.example", "")).toBe("");
	});

	it("blocks auth-to-auth loop targets", () => {
		expect(sanitizeInternalRedirect("/auth/callback")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
		expect(sanitizeInternalRedirect("/sign-in")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
		expect(sanitizeInternalRedirect("/sign-up")).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
	});
});

describe("buildAuthCallbackRedirect", () => {
	it("returns default callback without redirect param when none is provided", () => {
		expect(buildAuthCallbackRedirect(undefined)).toBe(
			DEFAULT_POST_LOGIN_REDIRECT,
		);
	});

	it("returns callback URL with encoded safe redirect param", () => {
		expect(buildAuthCallbackRedirect("/join?code=ABC123")).toBe(
			"/auth/callback?redirect=%2Fjoin%3Fcode%3DABC123",
		);
	});
});
