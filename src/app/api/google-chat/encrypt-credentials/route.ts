import { type NextRequest, NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";

/**
 * POST /api/google-chat/encrypt-credentials
 * Validate a GCP service account JSON and return the encrypted blob.
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	const { serviceAccountJson } = body;

	if (!serviceAccountJson || typeof serviceAccountJson !== "string") {
		return NextResponse.json(
			{ error: "serviceAccountJson is required" },
			{ status: 400 },
		);
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(serviceAccountJson) as Record<string, unknown>;
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON — paste the full service account key file" },
			{ status: 400 },
		);
	}

	if (
		typeof parsed.client_email !== "string" ||
		typeof parsed.private_key !== "string"
	) {
		return NextResponse.json(
			{
				error:
					"Service account JSON must include client_email and private_key fields",
			},
			{ status: 400 },
		);
	}

	const encryptedCredentials = await encryptToken(
		serviceAccountJson,
		"CHAT_CREDENTIALS_ENCRYPTION_KEY",
	);

	return NextResponse.json({
		encryptedCredentials,
		clientEmail: parsed.client_email,
	});
}
