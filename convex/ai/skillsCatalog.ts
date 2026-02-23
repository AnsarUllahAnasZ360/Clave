import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";

const catalogSkillValidator = v.object({
	id: v.string(),
	skillId: v.string(),
	name: v.string(),
	installs: v.number(),
	source: v.string(),
});

const searchResponseValidator = v.object({
	query: v.string(),
	searchType: v.string(),
	skills: v.array(catalogSkillValidator),
});

const importResponseValidator = v.object({
	skillId: v.id("skills"),
	created: v.boolean(),
	name: v.string(),
});

type CatalogSkill = {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
};

function parseSource(source: string): { owner: string; repo: string } {
	const normalized = source.trim().replace(/^https?:\/\/github\.com\//, "");
	const [owner, repo] = normalized.split("/");
	if (!owner || !repo) {
		throw new ConvexError("Invalid skills.sh source format");
	}
	return { owner, repo };
}

function buildSkillsPageUrl(source: string, skillId: string): string {
	return `https://skills.sh/${source}/${skillId}`;
}

function decodeHtmlEntities(input: string): string {
	return input
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#([0-9]+);/g, (_, dec) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		)
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function htmlToMarkdown(html: string): string {
	return decodeHtmlEntities(
		html
			.replace(/\r/g, "")
			.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n\n")
			.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n\n")
			.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n\n")
			.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n")
			.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
			.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
			.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "```\n$1\n```\n\n")
			.replace(
				/<\/?(ul|ol|div|span|strong|em|table|thead|tbody|tr|th|td)[^>]*>/gi,
				"",
			)
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim(),
	);
}

async function fetchSkillsPageMarkdown(
	source: string,
	skillId: string,
): Promise<string | null> {
	const pageUrl = buildSkillsPageUrl(source, skillId);
	const response = await fetch(pageUrl);
	if (!response.ok) return null;
	const html = await response.text();

	const proseMatch = html.match(
		/<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
	);
	if (!proseMatch) return null;

	const markdown = htmlToMarkdown(proseMatch[1]);
	return markdown || null;
}

function inferSkillCategory(skillId: string, markdown: string): string {
	const combined = `${skillId} ${markdown.slice(0, 800)}`.toLowerCase();
	if (
		combined.includes("design") ||
		combined.includes("ui") ||
		combined.includes("ux")
	) {
		return "Design";
	}
	if (
		combined.includes("docs") ||
		combined.includes("documentation") ||
		combined.includes("changelog")
	) {
		return "Docs";
	}
	if (
		combined.includes("devops") ||
		combined.includes("kubernetes") ||
		combined.includes("docker") ||
		combined.includes("terraform") ||
		combined.includes("ci/cd")
	) {
		return "DevOps";
	}
	if (
		combined.includes("sprint") ||
		combined.includes("planning") ||
		combined.includes("roadmap")
	) {
		return "PM";
	}
	return "Engineering";
}

function extractDescription(source: string, markdown: string): string {
	const firstLine = markdown
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line && !line.startsWith("#") && !line.startsWith("- "));
	if (firstLine) {
		return firstLine.slice(0, 220);
	}
	return `Imported from skills.sh (${source})`;
}

function encodeGitHubPath(path: string): string {
	return path
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
}

async function fetchGithubSkillMarkdown(
	source: string,
	skillId: string,
): Promise<string | null> {
	const { owner, repo } = parseSource(source);
	const repoResponse = await fetch(
		`https://api.github.com/repos/${owner}/${repo}`,
		{
			headers: { Accept: "application/vnd.github+json" },
		},
	);
	if (!repoResponse.ok) return null;
	const repoData = (await repoResponse.json()) as { default_branch?: string };
	const defaultBranch = repoData.default_branch ?? "main";

	const treeResponse = await fetch(
		`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
		{ headers: { Accept: "application/vnd.github+json" } },
	);
	if (!treeResponse.ok) return null;

	const treeData = (await treeResponse.json()) as {
		tree?: Array<{ path?: string; type?: string }>;
		truncated?: boolean;
	};
	const blobs = (treeData.tree ?? [])
		.filter((entry) => entry.type === "blob" && typeof entry.path === "string")
		.map((entry) => entry.path as string)
		.filter((path) => /(^|\/)SKILL\.md$/i.test(path));

	if (blobs.length === 0) return null;

	const normalizedSkillId = skillId.toLowerCase();
	const exactPath = blobs.find((path) =>
		path.toLowerCase().endsWith(`/${normalizedSkillId}/skill.md`),
	);
	const closePath =
		exactPath ??
		blobs.find((path) =>
			path.toLowerCase().includes(`/${normalizedSkillId}/`),
		) ??
		blobs.find((path) => path.toLowerCase().includes(normalizedSkillId)) ??
		null;

	if (!closePath) return null;

	const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(defaultBranch)}/${encodeGitHubPath(closePath)}`;
	const rawResponse = await fetch(rawUrl);
	if (!rawResponse.ok) return null;
	const markdown = (await rawResponse.text()).trim();
	return markdown || null;
}

export const search = action({
	args: {
		workspaceId: v.id("workspaces"),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	returns: searchResponseValidator,
	handler: async (ctx, args) => {
		await ctx.runQuery(internal.ai.chatQueries.validateAuth, {
			workspaceId: args.workspaceId,
		});

		const query = args.query.trim();
		if (!query) {
			return { query: "", searchType: "empty", skills: [] };
		}

		const response = await fetch(
			`https://skills.sh/api/search?q=${encodeURIComponent(query)}`,
			{
				headers: { Accept: "application/json" },
			},
		);
		if (!response.ok) {
			throw new ConvexError("skills.sh search is currently unavailable");
		}

		const payload = (await response.json()) as {
			query?: unknown;
			searchType?: unknown;
			skills?: unknown;
		};
		const rawSkills = Array.isArray(payload.skills) ? payload.skills : [];
		const parsedSkills = rawSkills
			.map((item) => {
				const candidate = item as {
					id?: unknown;
					skillId?: unknown;
					name?: unknown;
					installs?: unknown;
					source?: unknown;
				};
				if (
					typeof candidate.id !== "string" ||
					typeof candidate.skillId !== "string" ||
					typeof candidate.name !== "string" ||
					typeof candidate.source !== "string"
				) {
					return null;
				}
				const installs =
					typeof candidate.installs === "number" ? candidate.installs : 0;
				const parsed: CatalogSkill = {
					id: candidate.id,
					skillId: candidate.skillId,
					name: candidate.name,
					installs,
					source: candidate.source,
				};
				return parsed;
			})
			.filter((item): item is CatalogSkill => item !== null);

		const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
		return {
			query:
				typeof payload.query === "string" ? payload.query : args.query.trim(),
			searchType:
				typeof payload.searchType === "string" ? payload.searchType : "fuzzy",
			skills: parsedSkills.slice(0, limit),
		};
	},
});

export const importFromCatalog = action({
	args: {
		workspaceId: v.id("workspaces"),
		source: v.string(),
		skillId: v.string(),
		name: v.optional(v.string()),
	},
	returns: importResponseValidator,
	handler: async (ctx, args) => {
		await ctx.runQuery(internal.ai.chatQueries.validateAuth, {
			workspaceId: args.workspaceId,
		});

		const normalizedSkillId = args.skillId.trim();
		if (!normalizedSkillId) {
			throw new ConvexError("Skill ID is required");
		}

		const markdownFromGitHub = await fetchGithubSkillMarkdown(
			args.source,
			normalizedSkillId,
		);
		const markdown =
			markdownFromGitHub ??
			(await fetchSkillsPageMarkdown(args.source, normalizedSkillId));
		if (!markdown) {
			throw new ConvexError(
				"Unable to fetch skill content from skills.sh/GitHub",
			);
		}

		const skillName = (args.name?.trim() || normalizedSkillId).slice(0, 120);
		const description = extractDescription(args.source, markdown);
		const category = inferSkillCategory(normalizedSkillId, markdown);
		const sourceUrl = buildSkillsPageUrl(args.source, normalizedSkillId);

		const result = await (
			ctx.runMutation as (
				fn: unknown,
				payload: {
					workspaceId: Id<"workspaces">;
					name: string;
					description: string;
					category: string;
					markdownContent: string;
					sourceProvider: string;
					sourceRepo: string;
					sourceSkillId: string;
					sourceUrl: string;
				},
			) => Promise<{ skillId: Id<"skills">; created: boolean; name: string }>
		)(internal.ai.skills.upsertImportedFromCatalog, {
			workspaceId: args.workspaceId,
			name: skillName,
			description,
			category,
			markdownContent: markdown,
			sourceProvider: "skills.sh",
			sourceRepo: args.source.trim(),
			sourceSkillId: normalizedSkillId,
			sourceUrl,
		});

		return result;
	},
});
