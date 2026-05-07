/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const prepareNotificationCardRef = makeFunctionReference<
	"query",
	{
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
	},
	{
		status: "ready" | "drop";
		reason?: string;
		messageJson?: string;
	}
>("chat/googleChatCards:prepareNotificationCard");

describe("google chat notification card deep links (integration)", () => {
	it("prefers NEXT_PUBLIC_APP_URL over APP_URL", async () => {
		const t = createBackend();
		const { workspaceId, notificationId } = await t.run(async (ctx) => {
			const actorId = await ctx.db.insert("users", { name: "Ansar" });
			const recipientId = await ctx.db.insert("users", { name: "Talha" });
			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Talha Workspace",
				slug: "talha-workspace",
				ownerId: actorId,
			});
			await ctx.db.insert("chatPolicies", {
				workspaceId,
				provider: "google-chat",
				enabled: true,
				allowDirectMessages: true,
				allowSpaces: true,
				requireIdentityLink: false,
				updatedBy: actorId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			const issueId = await ctx.db.insert("issues", {
				title: "Follow up on notification links",
				identifier: "CLV-018",
				workspaceId,
				status: "todo",
				priority: "medium",
				type: "task",
				sortOrder: 0,
				createdBy: actorId,
				updatedAt: Date.now(),
			});
			const notificationId = await ctx.db.insert("notifications", {
				userId: recipientId,
				workspaceId,
				type: "issue_assigned",
				eventType: "issue_assigned",
				title: "Assigned to you: CLV-018",
				actorId,
				issueId,
				isRead: false,
			});
			return { workspaceId, notificationId };
		});

		vi.stubEnv("APP_URL", "https://clave.z360.js");
		vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://clave.z360.biz");

		try {
			const prepared = await t.query(prepareNotificationCardRef, {
				notificationId,
				workspaceId,
			});

			expect(prepared.status).toBe("ready");
			expect(prepared.messageJson).toContain(
				"https://clave.z360.biz/talha-workspace/issues/CLV-018",
			);
			expect(prepared.messageJson).not.toContain(
				"https://clave.z360.js/talha-workspace/issues/CLV-018",
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
