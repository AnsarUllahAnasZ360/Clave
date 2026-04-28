import { describe, expect, it } from "vitest";
import { resolveNotificationAppBaseUrl } from "../../convex/emailRelay";

describe("resolveNotificationAppBaseUrl", () => {
	it("prefers NEXT_PUBLIC_APP_URL over APP_URL", () => {
		expect(
			resolveNotificationAppBaseUrl({
				APP_URL: "https://clave.z360.js",
				NEXT_PUBLIC_APP_URL: "https://clave.z360.biz",
			}),
		).toBe("https://clave.z360.biz");
	});

	it("falls back to APP_URL when NEXT_PUBLIC_APP_URL is unset", () => {
		expect(
			resolveNotificationAppBaseUrl({
				APP_URL: "https://clave.z360.biz",
			}),
		).toBe("https://clave.z360.biz");
	});
});
