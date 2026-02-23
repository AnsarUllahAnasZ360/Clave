import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const code = searchParams.get("code");
	const state = searchParams.get("state");

	if (!code || !state) {
		return NextResponse.json(
			{ error: "Missing code or state parameter" },
			{ status: 400 },
		);
	}

	// Validate state from cookie (CSRF protection)
	const cookieStore = await cookies();
	const stateCookie = cookieStore.get("github_oauth_state");
	if (!stateCookie) {
		return NextResponse.json(
			{ error: "OAuth state cookie not found. Please try again." },
			{ status: 400 },
		);
	}

	let statePayload: {
		state: string;
		projectId: string;
		workspaceId: string;
		orgSlug: string;
		workspaceSlug: string;
		repoOwner: string;
		repoName: string;
	};

	try {
		statePayload = JSON.parse(stateCookie.value);
	} catch {
		return NextResponse.json(
			{ error: "Invalid OAuth state cookie" },
			{ status: 400 },
		);
	}

	if (statePayload.state !== state) {
		return NextResponse.json(
			{ error: "OAuth state mismatch. Possible CSRF attack." },
			{ status: 400 },
		);
	}

	// Clear the state cookie
	cookieStore.delete("github_oauth_state");

	const clientId = process.env.GITHUB_CLIENT_ID;
	const clientSecret = process.env.GITHUB_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		return NextResponse.json(
			{ error: "GitHub OAuth not configured on server" },
			{ status: 500 },
		);
	}

	// Exchange code for access token
	const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code,
		}),
	});

	if (!tokenResponse.ok) {
		const errorUrl = buildRedirectUrl(
			request,
			statePayload,
			"token_exchange_failed",
		);
		return NextResponse.redirect(errorUrl);
	}

	const tokenData = await tokenResponse.json();

	if (tokenData.error) {
		const errorUrl = buildRedirectUrl(request, statePayload, tokenData.error);
		return NextResponse.redirect(errorUrl);
	}

	const { access_token, token_type, scope } = tokenData;

	if (!access_token) {
		const errorUrl = buildRedirectUrl(request, statePayload, "no_access_token");
		return NextResponse.redirect(errorUrl);
	}

	// Fetch repo metadata to validate the token and get default_branch
	const repoResponse = await fetch(
		`${GITHUB_API_URL}/repos/${statePayload.repoOwner}/${statePayload.repoName}`,
		{
			headers: {
				Authorization: `Bearer ${access_token}`,
				Accept: "application/vnd.github+json",
			},
		},
	);

	if (!repoResponse.ok) {
		const errorUrl = buildRedirectUrl(request, statePayload, "repo_not_found");
		return NextResponse.redirect(errorUrl);
	}

	const repoData = await repoResponse.json();
	const defaultBranch = repoData.default_branch ?? "main";

	// Encrypt the access token
	const encryptedToken = await encryptToken(access_token);

	// Redirect back to the project page with connection data as URL params
	// The client component will complete the Convex mutation (which requires auth)
	const redirectUrl = new URL(
		`/${statePayload.orgSlug}/${statePayload.workspaceSlug}/projects/${statePayload.projectId}`,
		request.nextUrl.origin,
	);
	redirectUrl.searchParams.set("github_connect", "success");
	redirectUrl.searchParams.set("repo_owner", statePayload.repoOwner);
	redirectUrl.searchParams.set("repo_name", statePayload.repoName);
	redirectUrl.searchParams.set("default_branch", defaultBranch);
	redirectUrl.searchParams.set("encrypted_token", encryptedToken);
	redirectUrl.searchParams.set("token_type", token_type ?? "bearer");
	redirectUrl.searchParams.set("scope", scope ?? "repo");

	return NextResponse.redirect(redirectUrl);
}

function buildRedirectUrl(
	request: NextRequest,
	statePayload: { orgSlug: string; workspaceSlug: string; projectId: string },
	error: string,
): URL {
	const url = new URL(
		`/${statePayload.orgSlug}/${statePayload.workspaceSlug}/projects/${statePayload.projectId}`,
		request.nextUrl.origin,
	);
	url.searchParams.set("github_connect", "error");
	url.searchParams.set("github_error", error);
	return url;
}
