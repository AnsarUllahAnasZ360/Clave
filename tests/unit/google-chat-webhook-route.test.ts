// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

// Use vi.hoisted to ensure mock values are available when vi.mock factories execute
const { mockWebhookHandler } = vi.hoisted(() => ({
	mockWebhookHandler: vi.fn(),
}));

vi.mock("chat", () => {
	// Return a constructor function (not arrow) so `new Chat(...)` works
	function MockChat() {
		return { webhooks: { gchat: mockWebhookHandler } };
	}
	return { Chat: MockChat };
});

vi.mock("@chat-adapter/gchat", () => ({
	createGoogleChatAdapter: vi.fn(),
}));

vi.mock("@chat-adapter/state-memory", () => ({
	createMemoryState: vi.fn(),
}));

describe("google chat webhook route (SDK delegation)", () => {
	it("delegates POST to bot.webhooks.gchat", async () => {
		const sdkResponse = new Response(JSON.stringify({ ok: true }), {
			status: 200,
		});
		mockWebhookHandler.mockResolvedValue(sdkResponse);

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		const request = new Request("http://localhost/api/webhooks/google-chat", {
			method: "POST",
			body: JSON.stringify({ type: "MESSAGE", message: { text: "hello" } }),
			headers: { "content-type": "application/json" },
		});

		const response = await POST(request);

		expect(mockWebhookHandler).toHaveBeenCalledTimes(1);
		expect(mockWebhookHandler).toHaveBeenCalledWith(request);
		expect(response).toBe(sdkResponse);
	});

	it("passes the original request object through unchanged", async () => {
		mockWebhookHandler.mockReset();
		mockWebhookHandler.mockResolvedValue(new Response("{}", { status: 200 }));

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		const request = new Request("http://localhost/api/webhooks/google-chat", {
			method: "POST",
			body: JSON.stringify({ type: "CARD_CLICKED" }),
			headers: {
				authorization: "Bearer test-token",
				"content-type": "application/json",
			},
		});

		await POST(request);

		const passedRequest = mockWebhookHandler.mock.calls[0][0];
		expect(passedRequest).toBe(request);
	});

	it("propagates SDK errors to the caller", async () => {
		mockWebhookHandler.mockReset();
		mockWebhookHandler.mockRejectedValue(new Error("SDK verification failed"));

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		await expect(
			POST(
				new Request("http://localhost/api/webhooks/google-chat", {
					method: "POST",
					body: "{}",
				}),
			),
		).rejects.toThrow("SDK verification failed");
	});
});
