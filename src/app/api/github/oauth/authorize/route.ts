import { type NextRequest, NextResponse } from "next/server";
import { signOAuthState } from "@/lib/crypto";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const projectId = searchParams.get("projectId");
	const projectSlug = searchParams.get("projectSlug");
	const workspaceId = searchParams.get("workspaceId");
	const workspaceSlug = searchParams.get("workspaceSlug");
	const repoOwner = searchParams.get("repoOwner");
	const repoName = searchParams.get("repoName");

	if (
		!projectId ||
		!projectSlug ||
		!workspaceId ||
		!workspaceSlug ||
		!repoOwner ||
		!repoName
	) {
		return NextResponse.json(
			{
				error:
					"projectId, projectSlug, workspaceId, workspaceSlug, repoOwner, and repoName are required",
			},
			{ status: 400 },
		);
	}

	const clientId = process.env.GITHUB_CLIENT_ID;
	const clientSecret = process.env.GITHUB_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		return NextResponse.json(
			{ error: "GitHub OAuth not configured" },
			{ status: 500 },
		);
	}

	const statePayload = {
		projectId,
		projectSlug,
		workspaceId,
		workspaceSlug,
		repoOwner,
		repoName,
	};
	const state = await signOAuthState(statePayload, clientSecret);

	const baseUrl =
		process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
		request.nextUrl.origin;
	const redirectUri = `${baseUrl}/api/github/oauth/callback`;
	const params = new URLSearchParams({
		client_id: clientId,
		scope: "repo",
		state,
		redirect_uri: redirectUri,
	});

	return NextResponse.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
}
