import { type NextRequest, NextResponse } from "next/server";
import { signOAuthState } from "@/lib/crypto";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const projectNumber = searchParams.get("project_number");

	if (!projectNumber) {
		return NextResponse.json(
			{ error: "project_number is required" },
			{ status: 400 },
		);
	}

	const secret = process.env.GOOGLE_CHAT_MARKETPLACE_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "Marketplace integration not configured" },
			{ status: 500 },
		);
	}

	const statePayload: Record<string, string> = {
		marketplaceProjectNumber: projectNumber,
		ts: Date.now().toString(),
	};

	const installId = searchParams.get("install_id");
	if (installId) {
		statePayload.marketplaceInstallId = installId;
	}

	const state = await signOAuthState(statePayload, secret);

	const baseUrl =
		process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
		request.nextUrl.origin;

	return NextResponse.redirect(
		`${baseUrl}/google-chat/setup?state=${encodeURIComponent(state)}`,
	);
}
