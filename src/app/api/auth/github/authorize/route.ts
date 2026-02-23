import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const projectId = searchParams.get("projectId");
	const workspaceId = searchParams.get("workspaceId");
	const orgSlug = searchParams.get("orgSlug");
	const workspaceSlug = searchParams.get("workspaceSlug");
	const repoOwner = searchParams.get("repoOwner");
	const repoName = searchParams.get("repoName");

	if (
		!projectId ||
		!workspaceId ||
		!orgSlug ||
		!workspaceSlug ||
		!repoOwner ||
		!repoName
	) {
		return NextResponse.json(
			{
				error:
					"projectId, workspaceId, orgSlug, workspaceSlug, repoOwner, and repoName are required",
			},
			{ status: 400 },
		);
	}

	const clientId = process.env.GITHUB_CLIENT_ID;
	if (!clientId) {
		return NextResponse.json(
			{ error: "GitHub OAuth not configured" },
			{ status: 500 },
		);
	}

	// Generate random state for CSRF protection
	const stateBytes = crypto.getRandomValues(new Uint8Array(32));
	const state = Array.from(stateBytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	// Store state + context in httpOnly cookie
	const statePayload = JSON.stringify({
		state,
		projectId,
		workspaceId,
		orgSlug,
		workspaceSlug,
		repoOwner,
		repoName,
	});

	const cookieStore = await cookies();
	cookieStore.set("github_oauth_state", statePayload, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 600, // 10 minutes
		path: "/",
	});

	// Build GitHub OAuth authorize URL
	const redirectUri = `${request.nextUrl.origin}/api/auth/github/callback`;
	const params = new URLSearchParams({
		client_id: clientId,
		scope: "repo",
		state,
		redirect_uri: redirectUri,
	});

	return NextResponse.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
}
