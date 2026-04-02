import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { after } from "next/server";
import { ensureHandlers, getBot } from "@/lib/chat/bot";

export const maxDuration = 60;

function getConvexClient(): ConvexHttpClient {
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
	return new ConvexHttpClient(url);
}

const postMessageRef = makeFunctionReference<
	"action",
	{ workspaceId: string; spaceName: string; text: string },
	{ status: "sent" | "failed"; messageName?: string; reason?: string }
>("chat/googleChatSender:postMessage");

const resolveWorkspaceRef = makeFunctionReference<
	"query",
	{ provider: "google-chat"; spaceName?: string; chatUserId?: string },
	string | null
>("chatIntegrations:resolveWorkspaceForWebhook");

// ---------------------------------------------------------------------------
// Exported message constants — also used by handlers.ts for @Clave help
// ---------------------------------------------------------------------------

export const WELCOME_DM =
	"Welcome to *Clave* — AI-powered project management, right inside Google Chat.\n\n" +
	"I can help you find issues, create tasks, search documents, and get project updates without leaving your conversation.\n\n" +
	"Try asking me something like:\n" +
	'• "What issues are assigned to me?"\n' +
	'• "Create a bug: login page crashes on Safari"\n' +
	'• "Summarize the Core API project"\n\n' +
	"Type /help to see everything I can do.";

export const WELCOME_SPACE =
	"Hi there! *Clave* is now active in this space — your AI project management assistant.\n\n" +
	"I help your team manage issues, search documents, and get project updates without leaving Google Chat.\n\n" +
	"To get started, mention me:\n" +
	'• "@Clave what issues are in the current sprint?"\n' +
	'• "@Clave create an issue: update the API docs"\n\n' +
	"Type /help to see everything I can do.";

export const HELP_TEXT =
	"*Clave — Help*\n\n" +
	"*Available commands:*\n\n" +
	"• */help* — Show this help message\n" +
	"• *@Clave help* — Same as /help\n\n" +
	"*What I can do:*\n\n" +
	"• *Find and search* — Ask about issues, projects, documents, sprints, labels, and members\n" +
	'• *Show details* — Get details and recent activity on any issue (e.g. "Show details for CLV-042")\n' +
	'• *Create issues* — Describe a bug or feature and I\'ll create it (e.g. "Create a bug: Login fails on Safari")\n' +
	'• *Update issues* — Assign, change status, or add comments (e.g. "Assign CLV-042 to Alex")\n' +
	'• *Move issues* — Change issue status (e.g. "Move CLV-042 to in_review")\n' +
	"• *Create documents* — Create documents, sprints, labels, and projects\n" +
	"• *Search knowledge* — Search project knowledge and connected codebases\n" +
	"• *Triage conversations* — Turn a chat thread into a tracked issue\n" +
	"• *Get summaries* — Project status reports and sprint summaries\n" +
	"• *Check notifications* — See your latest notifications\n\n" +
	"*How to use:*\n\n" +
	"• *In spaces:* Mention me with @Clave followed by your request\n" +
	"• *In DMs:* Just type your message directly\n\n" +
	"*Examples:*\n" +
	'• "Find issues assigned to me"\n' +
	'• "Show details for CLV-042"\n' +
	'• "Create a bug: Login fails on Safari"\n' +
	'• "Assign CLV-042 to Alex"\n' +
	'• "Move CLV-042 to in_review"\n' +
	'• "Find documents about onboarding"\n' +
	'• "What\'s in the current sprint?"\n\n' +
	"Need more help? Visit https://clave.z360.biz/support";

// ---------------------------------------------------------------------------
// Async message posting helper — resolves workspace, then posts via Convex.
// Falls back to SDK adapter.postMessage if Convex posting fails.
// ---------------------------------------------------------------------------

async function postAsync(spaceName: string, text: string): Promise<void> {
	try {
		const convex = getConvexClient();
		const workspaceId = await convex.query(resolveWorkspaceRef, {
			provider: "google-chat",
			spaceName,
		});
		if (workspaceId) {
			const result = await convex.action(postMessageRef, {
				workspaceId,
				spaceName,
				text,
			});
			if (result.status === "sent") return;
			console.warn("[route] Convex postMessage failed:", result.reason);
		}
	} catch (err) {
		console.warn("[route] postAsync Convex error:", err);
	}

	// Fallback: post via SDK adapter
	try {
		await ensureHandlers();
		const adapter = getBot().getAdapter("gchat");
		if (adapter) {
			await adapter.postMessage(`gchat:${spaceName}`, text);
		}
	} catch (err) {
		console.error("[route] postAsync SDK fallback error:", err);
	}
}

// ---------------------------------------------------------------------------
// Webhook handler
//
// Google Chat Add-ons HTTP endpoints require async message posting — sync
// responses with { text: "..." } are NOT displayed. The adapter always
// returns Response.json({}) and posts via the Chat API in the background.
// We follow the same pattern: return {} immediately, post in after().
// ---------------------------------------------------------------------------

export const POST = async (req: Request) => {
	const bodyText = await req.text();
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(bodyText);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	// biome-ignore lint/suspicious/noExplicitAny: Google Chat webhook payload
	const event = parsed as any;

	// ── App commands (slash commands) → post help asynchronously ──
	// Google Chat Add-ons format: event.chat.appCommandPayload
	const appCommand = event.chat?.appCommandPayload;
	if (appCommand?.appCommandMetadata?.appCommandType === "SLASH_COMMAND") {
		const spaceName: string | undefined = appCommand.space?.name;
		after(async () => {
			if (spaceName) {
				await postAsync(spaceName, HELP_TEXT);
			} else {
				console.error("[route] slash command: no space name");
			}
		});
		return Response.json({});
	}

	// ── ADDED_TO_SPACE → post welcome message asynchronously ──────
	const addedPayload = event.chat?.addedToSpacePayload;
	if (addedPayload) {
		const hasMessage = !!event.chat?.messagePayload;

		after(async () => {
			const space = addedPayload.space;
			const spaceName: string | undefined = space?.name;
			const isDM =
				space?.type === "DM" ||
				space?.spaceType === "DIRECT_MESSAGE";

			// Post welcome message via Convex (uses BYOSA credentials)
			if (spaceName) {
				await postAsync(
					spaceName,
					isDM ? WELCOME_DM : WELCOME_SPACE,
				);
			}

			// Process the accompanying message (first DM) if present
			if (hasMessage) {
				await ensureHandlers();
				const bgReq = new Request(req.url, {
					method: req.method,
					headers: req.headers,
					body: bodyText,
				});
				await getBot().webhooks.gchat(bgReq, {
					waitUntil: (task: Promise<unknown>) =>
						after(() => task),
				});
			}
		});

		return Response.json({});
	}

	// ── All other events (messages, card clicks) → SDK ────────────
	// "@Clave help" and "help" in DMs are handled inside handlers.ts
	// which detects the help pattern and posts HELP_TEXT directly.
	await ensureHandlers();

	const reconstructed = new Request(req.url, {
		method: req.method,
		headers: req.headers,
		body: bodyText,
	});

	return getBot().webhooks.gchat(reconstructed, {
		waitUntil: (task: Promise<unknown>) => after(() => task),
	});
};
