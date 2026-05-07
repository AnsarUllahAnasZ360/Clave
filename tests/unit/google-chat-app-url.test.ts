import { describe, expect, it } from "vitest";
import { resolveChatAppBaseUrl } from "../../convex/chat/appUrl";

describe("resolveChatAppBaseUrl", () => {
	it("prefers NEXT_PUBLIC_APP_URL over APP_URL", () => {
		expect(
			resolveChatAppBaseUrl({
				APP_URL: "https://clave.z360.js",
				NEXT_PUBLIC_APP_URL: "https://clave.z360.biz",
			}),
		).toBe("https://clave.z360.biz");
	});

	it("falls back to APP_URL when NEXT_PUBLIC_APP_URL is unset", () => {
		expect(
			resolveChatAppBaseUrl({
				APP_URL: "https://clave.z360.biz",
			}),
		).toBe("https://clave.z360.biz");
	});

	it("normalizes bare NEXT_PUBLIC_APP_URL values to https", () => {
		expect(
			resolveChatAppBaseUrl({
				NEXT_PUBLIC_APP_URL: "clave.z360.biz",
			}),
		).toBe("https://clave.z360.biz");
	});
});
