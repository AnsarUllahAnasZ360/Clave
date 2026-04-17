/**
 * Stable URL for a persisted whiteboard image.
 *
 * Resolves a `whiteboardImages` row to its current signed Convex storage URL
 * and redirects the client there. Used as the `src` in markdown image embeds
 * that the AI agent writes into issue / project descriptions when turning a
 * board into a plan — the underlying signed URL expires, but this proxy
 * re-resolves on every request so the embed never breaks.
 */
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const getImageUrlRef = makeFunctionReference<
	"query",
	{ imageId: string },
	string | null
>("whiteboards:getImageUrlById");

function getConvexClient(): ConvexHttpClient {
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
	return new ConvexHttpClient(url);
}

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ imageId: string }> },
) {
	const { imageId } = await params;
	if (!imageId) {
		return NextResponse.json({ error: "imageId required" }, { status: 400 });
	}
	try {
		const client = getConvexClient();
		const url = await client.query(getImageUrlRef, { imageId });
		if (!url) {
			return NextResponse.json({ error: "Image not found" }, { status: 404 });
		}
		return NextResponse.redirect(url, 302);
	} catch (err) {
		console.error("[whiteboard-image] resolve failed:", err);
		return NextResponse.json(
			{ error: "Failed to resolve image" },
			{ status: 500 },
		);
	}
}
