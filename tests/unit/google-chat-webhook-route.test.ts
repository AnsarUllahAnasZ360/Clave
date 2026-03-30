// @vitest-environment node
// Tests for webhook route: SDK delegation, welcome messages, slash commands, DM handling, fallback resolution

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

vi.mock("next/server", () => ({
	after: vi.fn((fn: () => void) => fn()),
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
		const [passedReq, passedOpts] = mockWebhookHandler.mock.calls[0];
		// Route reconstructs the request after reading the body for inspection
		expect(passedReq.url).toBe(request.url);
		expect(passedReq.method).toBe(request.method);
		expect(passedOpts).toHaveProperty("waitUntil");
		expect(typeof passedOpts.waitUntil).toBe("function");
		expect(response).toBe(sdkResponse);
	});

	it("reconstructs request with same URL, method, and headers", async () => {
		mockWebhookHandler.mockReset();
		mockWebhookHandler.mockResolvedValue(new Response("{}", { status: 200 }));

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		const body = JSON.stringify({ type: "CARD_CLICKED" });
		const request = new Request("http://localhost/api/webhooks/google-chat", {
			method: "POST",
			body,
			headers: {
				authorization: "Bearer test-token",
				"content-type": "application/json",
			},
		});

		await POST(request);

		const passedRequest = mockWebhookHandler.mock.calls[0][0];
		expect(passedRequest.url).toBe(request.url);
		expect(passedRequest.method).toBe("POST");
		expect(passedRequest.headers.get("authorization")).toBe(
			"Bearer test-token",
		);
		const passedBody = await passedRequest.text();
		expect(passedBody).toBe(body);
	});

	it("returns welcome message for ADDED_TO_SPACE in DM", async () => {
		mockWebhookHandler.mockReset();

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		const request = new Request("http://localhost/api/webhooks/google-chat", {
			method: "POST",
			body: JSON.stringify({
				chat: {
					addedToSpacePayload: {
						space: { name: "spaces/abc", type: "DM" },
					},
				},
			}),
			headers: { "content-type": "application/json" },
		});

		const response = await POST(request);
		const data = await response.json();

		expect(data.text).toContain("Hello! I'm Clave");
		expect(data.text).toContain("Just type a message");
		expect(mockWebhookHandler).not.toHaveBeenCalled();
	});

	it("returns welcome message for ADDED_TO_SPACE in space", async () => {
		mockWebhookHandler.mockReset();

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		const request = new Request("http://localhost/api/webhooks/google-chat", {
			method: "POST",
			body: JSON.stringify({
				chat: {
					addedToSpacePayload: {
						space: { name: "spaces/abc", type: "ROOM" },
					},
				},
			}),
			headers: { "content-type": "application/json" },
		});

		const response = await POST(request);
		const data = await response.json();

		expect(data.text).toContain("Hello! I'm Clave");
		expect(data.text).toContain("@Clave");
		expect(mockWebhookHandler).not.toHaveBeenCalled();
	});

	it("returns help text for slash commands", async () => {
		mockWebhookHandler.mockReset();

		const { POST } = await import(
			"../../src/app/api/webhooks/google-chat/route"
		);

		const request = new Request("http://localhost/api/webhooks/google-chat", {
			method: "POST",
			body: JSON.stringify({
				commonEventObject: { invokedFunction: "1" },
				chat: {
					messagePayload: {
						message: { slashCommand: { commandId: 1 } },
						space: { name: "spaces/abc" },
					},
				},
			}),
			headers: { "content-type": "application/json" },
		});

		const response = await POST(request);
		const data = await response.json();

		expect(data.text).toContain("Clave");
		expect(data.text).toContain("Ask questions");
		expect(mockWebhookHandler).not.toHaveBeenCalled();
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
