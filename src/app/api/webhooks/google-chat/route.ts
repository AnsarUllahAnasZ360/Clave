import { after } from "next/server";
import { ensureHandlers, getBot } from "@/lib/chat/bot";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Welcome messages for ADDED_TO_SPACE events
// ---------------------------------------------------------------------------

const WELCOME_DM =
	"Hello! I'm Clave — your AI-powered project management assistant.\n\n" +
	"You can ask me about your issues, projects, docs, and more. Just type a message to get started.\n\n" +
	"Use /help to see what I can do.";

const WELCOME_SPACE =
	"Hello! I'm Clave — your AI-powered project management assistant.\n\n" +
	"Mention me with @Clave to ask about issues, projects, docs, and more.\n\n" +
	"Use /help to see what I can do.";

// ---------------------------------------------------------------------------
// /help slash command response
// ---------------------------------------------------------------------------

const HELP_TEXT =
	"*Clave — AI Project Management Assistant*\n\n" +
	"Here's what I can do:\n\n" +
	"• *Ask questions* — Ask about your issues, projects, documents, and workspace data\n" +
	"• *Create issues* — Describe a bug or feature and I'll draft an issue for you\n" +
	"• *Update issues* — Change status, assign team members, or update details\n" +
	"• *Search* — Find issues, docs, or projects by keyword or description\n" +
	"• *Triage conversations* — Turn a chat thread into a tracked issue\n" +
	"• *Get summaries* — Ask for project status reports or sprint summaries\n\n" +
	"*In spaces:* Mention me with @Clave followed by your question.\n" +
	"*In DMs:* Just type your message directly.\n\n" +
	"Need help? Visit https://clave.z360.biz/support";

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export const POST = async (req: Request) => {
	// Read the body once so we can inspect it, then reconstruct for the SDK
	const bodyText = await req.text();
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(bodyText);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	// biome-ignore lint/suspicious/noExplicitAny: Google Chat webhook payload
	const event = parsed as any;

	// ── ADDED_TO_SPACE → welcome message ──────────────────────────
	const addedPayload = event.chat?.addedToSpacePayload;
	if (addedPayload) {
		const space = addedPayload.space;
		const isDM = space?.type === "DM" || space?.spaceType === "DIRECT_MESSAGE";
		const welcomeText = isDM ? WELCOME_DM : WELCOME_SPACE;

		// If the event also contains a message (first DM), process it in the
		// background so the user's message still gets a response.
		const hasMessage = !!event.chat?.messagePayload;
		if (hasMessage) {
			after(async () => {
				await ensureHandlers();
				const bgReq = new Request(req.url, {
					method: req.method,
					headers: req.headers,
					body: bodyText,
				});
				await getBot().webhooks.gchat(bgReq, {
					waitUntil: (task: Promise<unknown>) => after(() => task),
				});
			});
		}

		return Response.json({ text: welcomeText });
	}

	// ── Slash commands → respond directly ─────────────────────────
	const invokedFunction = event.commonEventObject?.invokedFunction;
	const slashCommand = event.chat?.messagePayload?.message?.slashCommand;
	if (invokedFunction && slashCommand) {
		// /help is command ID 1 in the Google Chat API configuration
		return Response.json({ text: HELP_TEXT });
	}

	// ── All other events → delegate to Chat SDK ───────────────────
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
