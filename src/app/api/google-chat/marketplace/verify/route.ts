import { type NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/crypto";

export async function POST(request: NextRequest) {
	const secret = process.env.GOOGLE_CHAT_MARKETPLACE_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "Marketplace integration not configured" },
			{ status: 500 },
		);
	}

	const body = (await request.json()) as { state?: string };
	const state = body.state;
	if (!state || typeof state !== "string") {
		return NextResponse.json({ error: "state is required" }, { status: 400 });
	}

	try {
		const payload = await verifyOAuthState(state, secret);
		return NextResponse.json({
			valid: true,
			marketplaceProjectNumber: payload.marketplaceProjectNumber,
			marketplaceInstallId: payload.marketplaceInstallId ?? null,
		});
	} catch {
		return NextResponse.json(
			{ error: "Invalid or expired state token" },
			{ status: 400 },
		);
	}
}
