import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

/**
 * GitHub Webhook Endpoint — /api/webhooks/github
 *
 * Receives webhook events from GitHub and delegates to a Convex action
 * for HMAC signature verification and processing. This route is a thin
 * proxy; all security validation happens server-side in Convex.
 *
 * Returns 200 immediately after dispatching to avoid GitHub's 10s timeout.
 */

// Reference to the Convex action (new file, not in generated types)
const handleWebhookRef = makeFunctionReference<
	"action",
	{
		rawBody: string;
		signature: string;
		event: string;
		deliveryId: string;
	},
	{ status: string; message?: string }
>("ai/indexing/githubWebhook:handleWebhook");

export async function POST(req: Request) {
	const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		return Response.json(
			{ error: "Convex URL not configured" },
			{ status: 500 },
		);
	}

	// Read raw body as text (required for HMAC signature verification)
	const rawBody = await req.text();

	// Extract GitHub webhook headers
	const signature = req.headers.get("X-Hub-Signature-256") ?? "";
	const event = req.headers.get("X-GitHub-Event") ?? "";
	const deliveryId = req.headers.get("X-GitHub-Delivery") ?? "";

	// Dispatch to Convex action for verification and processing
	const client = new ConvexHttpClient(convexUrl);

	try {
		const result = await client.action(handleWebhookRef, {
			rawBody,
			signature,
			event,
			deliveryId,
		});

		if (result.status === "invalid_signature") {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}

		return Response.json(result);
	} catch (error) {
		console.error("[webhook/github] Error processing webhook:", error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}
