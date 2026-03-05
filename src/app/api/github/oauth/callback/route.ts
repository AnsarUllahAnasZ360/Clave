import { type NextRequest, NextResponse } from "next/server";
import { encryptToken, verifyOAuthState } from "@/lib/crypto";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";

function oauthErrorHtml(title: string, message: string): NextResponse {
	return new NextResponse(
		`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem;"><h1>${title}</h1><p>${message}</p><p><a href="/">Return home</a></p></body></html>`,
		{
			status: 400,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		},
	);
}

export async function GET(request: NextRequest) {
	const rawUrl = new URL(request.url);
	const code = rawUrl.searchParams.get("code");
	const stateParam = rawUrl.searchParams.get("state");

	const ghError = rawUrl.searchParams.get("error");
	const ghErrorDescription = rawUrl.searchParams.get("error_description");

	const clientSecret = process.env.GITHUB_CLIENT_SECRET;
	if (!clientSecret) {
		return oauthErrorHtml(
			"GitHub OAuth Error",
			"Server not configured: GITHUB_CLIENT_SECRET is missing.",
		);
	}

	if (ghError) {
		if (stateParam) {
			try {
				const statePayload = (await verifyOAuthState(
					stateParam,
					clientSecret,
				)) as {
					workspaceSlug: string;
					projectSlug: string;
				};
				const errorUrl = buildRedirectUrl(request, statePayload, ghError);
				return NextResponse.redirect(errorUrl);
			} catch {
				// Fall through
			}
		}
		return oauthErrorHtml(
			"GitHub Authorization Failed",
			`${ghError}${ghErrorDescription ? `: ${ghErrorDescription}` : ""}`,
		);
	}

	if (!code || !stateParam) {
		return oauthErrorHtml(
			"GitHub OAuth Error",
			`Missing code or state. HasCode: ${!!code}, HasState: ${!!stateParam}. Update your GitHub OAuth App callback URL to: ${rawUrl.origin}/api/github/oauth/callback`,
		);
	}

	let statePayload: {
		projectId: string;
		projectSlug: string;
		workspaceId: string;
		workspaceSlug: string;
		repoOwner: string;
		repoName: string;
	};
	try {
		statePayload = (await verifyOAuthState(
			stateParam,
			clientSecret,
		)) as typeof statePayload;
	} catch {
		return oauthErrorHtml(
			"Invalid OAuth State",
			"State could not be verified. Please try connecting again.",
		);
	}

	const clientId = process.env.GITHUB_CLIENT_ID;
	if (!clientId) {
		const errorUrl = buildRedirectUrl(
			request,
			statePayload,
			"server_not_configured",
		);
		return NextResponse.redirect(errorUrl);
	}

	const baseUrl =
		process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || rawUrl.origin;
	const redirectUri = `${baseUrl}/api/github/oauth/callback`;
	let tokenData: Record<string, string>;
	try {
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
				redirect_uri: redirectUri,
			}),
		});

		tokenData = await tokenResponse.json();
	} catch {
		const errorUrl = buildRedirectUrl(
			request,
			statePayload,
			"token_exchange_failed",
		);
		return NextResponse.redirect(errorUrl);
	}

	if (tokenData.error) {
		const errorUrl = buildRedirectUrl(request, statePayload, tokenData.error);
		return NextResponse.redirect(errorUrl);
	}

	const { access_token, token_type, scope } = tokenData;

	if (!access_token) {
		const errorUrl = buildRedirectUrl(request, statePayload, "no_access_token");
		return NextResponse.redirect(errorUrl);
	}

	let defaultBranch = "main";
	try {
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
			const errorUrl = buildRedirectUrl(
				request,
				statePayload,
				"repo_not_found",
			);
			return NextResponse.redirect(errorUrl);
		}

		const repoData = await repoResponse.json();
		defaultBranch = repoData.default_branch ?? "main";
	} catch {
		const errorUrl = buildRedirectUrl(
			request,
			statePayload,
			"repo_fetch_failed",
		);
		return NextResponse.redirect(errorUrl);
	}

	let encryptedToken: string;
	try {
		encryptedToken = await encryptToken(access_token);
	} catch {
		const errorUrl = buildRedirectUrl(
			request,
			statePayload,
			"encryption_failed",
		);
		return NextResponse.redirect(errorUrl);
	}

	const redirectUrl = new URL(
		`/${statePayload.workspaceSlug}/projects/${statePayload.projectSlug}`,
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
	statePayload: { workspaceSlug: string; projectSlug: string },
	error: string,
): URL {
	const url = new URL(
		`/${statePayload.workspaceSlug}/projects/${statePayload.projectSlug}`,
		request.nextUrl.origin,
	);
	url.searchParams.set("github_connect", "error");
	url.searchParams.set("github_error", error);
	return url;
}
