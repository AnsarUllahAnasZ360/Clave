import { type NextRequest, NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";

const GITHUB_API_URL = "https://api.github.com";

/**
 * POST /api/auth/github/connect-pat
 * Validate a GitHub PAT, fetch repo info, encrypt the token, and return connection data.
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	const { token, repoOwner, repoName } = body;

	if (!token || !repoOwner || !repoName) {
		return NextResponse.json(
			{ error: "token, repoOwner, and repoName are required" },
			{ status: 400 },
		);
	}

	// Validate repo owner/name to prevent path traversal and SSRF
	const GITHUB_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
	if (
		!GITHUB_NAME_PATTERN.test(repoOwner) ||
		!GITHUB_NAME_PATTERN.test(repoName)
	) {
		return NextResponse.json(
			{ error: "Invalid repository owner or name" },
			{ status: 400 },
		);
	}

	// Validate the token by fetching the repo
	const repoResponse = await fetch(
		`${GITHUB_API_URL}/repos/${repoOwner}/${repoName}`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
			},
		},
	);

	if (!repoResponse.ok) {
		const status = repoResponse.status;
		if (status === 401) {
			return NextResponse.json(
				{ error: "Invalid token — check that it hasn't expired" },
				{ status: 401 },
			);
		}
		if (status === 404) {
			return NextResponse.json(
				{
					error: `Repository ${repoOwner}/${repoName} not found — check the URL and token permissions`,
				},
				{ status: 404 },
			);
		}
		return NextResponse.json(
			{ error: `GitHub API error (${status})` },
			{ status: 502 },
		);
	}

	const repoData = await repoResponse.json();
	const defaultBranch = repoData.default_branch ?? "main";

	// Check token scopes
	const scopeHeader = repoResponse.headers.get("x-oauth-scopes") ?? "";
	const hasRepoScope = scopeHeader.split(",").some((s) => s.trim() === "repo");

	// Encrypt the token
	const encryptedToken = await encryptToken(token);

	return NextResponse.json({
		repoOwner,
		repoName,
		defaultBranch,
		encryptedToken,
		tokenType: "bearer",
		scope: hasRepoScope ? "repo" : scopeHeader || "unknown",
	});
}
