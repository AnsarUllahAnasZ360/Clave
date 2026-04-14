import type { UIMessage } from "@convex-dev/agent/react";
import { describe, expect, it } from "vitest";
import { isPendingUserMessageDelivered } from "@/hooks/use-ai-chat";

describe("isPendingUserMessageDelivered", () => {
	it("matches when persisted file URL differs from pending data URL", () => {
		const rawMessages: UIMessage[] = [
			{
				id: "1",
				role: "user",
				parts: [
					{ type: "text", text: "see th img" },
					{
						type: "file",
						url: "https://example.convex.cloud/api/storage/abc",
						mediaType: "image/jpeg",
						filename: "crazy-phoenix-5k-to-1920x1080.jpg",
					},
				],
				key: "1",
				order: 0,
				stepOrder: 0,
				status: "success",
				text: "see th img",
				_creationTime: Date.now(),
			},
		];
		const pending = {
			prompt: "see th img",
			files: [
				{
					url: "data:image/jpeg;base64,AAAA",
					mediaType: "image/jpeg",
					filename: "crazy-phoenix-5k-to-1920x1080.jpg",
				},
			],
		};
		expect(isPendingUserMessageDelivered(rawMessages, pending)).toBe(true);
	});

	it("matches on media types when filenames differ between pending and saved", () => {
		const rawMessages: UIMessage[] = [
			{
				id: "1",
				role: "user",
				parts: [
					{ type: "text", text: "see th img" },
					{
						type: "file",
						url: "https://example.convex.cloud/api/storage/abc",
						mediaType: "image/jpeg",
						filename: "crazy-phoenix-5k-to-1920x1080.jpg",
					},
				],
				key: "1",
				order: 0,
				stepOrder: 0,
				status: "success",
				text: "see th img",
				_creationTime: Date.now(),
			},
		];
		const pending = {
			prompt: "see th img",
			files: [
				{
					url: "data:image/jpeg;base64,AAAA",
					mediaType: "image/jpeg",
				},
			],
		};
		expect(isPendingUserMessageDelivered(rawMessages, pending)).toBe(true);
	});

	it("returns false when file count differs", () => {
		const rawMessages: UIMessage[] = [
			{
				id: "1",
				role: "user",
				parts: [{ type: "text", text: "hi" }],
				key: "1",
				order: 0,
				stepOrder: 0,
				status: "success",
				text: "hi",
				_creationTime: Date.now(),
			},
		];
		expect(
			isPendingUserMessageDelivered(rawMessages, {
				prompt: "hi",
				files: [{ url: "data:x", mediaType: "image/png", filename: "a.png" }],
			}),
		).toBe(false);
	});
});
