import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

function isValidSource(source: string): boolean {
	return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(source);
}

function isValidSkillId(skillId: string): boolean {
	return /^[a-zA-Z0-9._-]+$/.test(skillId);
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const source = (searchParams.get("source") ?? "").trim();
	const skillId = (searchParams.get("skillId") ?? "").trim();

	if (!source || !skillId) {
		return NextResponse.json(
			{ error: "source and skillId are required" },
			{ status: 400 },
		);
	}
	if (!isValidSource(source) || !isValidSkillId(skillId)) {
		return NextResponse.json(
			{ error: "Invalid source or skillId format" },
			{ status: 400 },
		);
	}

	const sourceUrl = `https://skills.sh/${source}/${skillId}`;
	const response = await fetch(sourceUrl, {
		headers: { "User-Agent": "Clave/skills-import" },
	});
	if (!response.ok) {
		return NextResponse.json(
			{ error: "skills.sh page is currently unavailable" },
			{ status: 502 },
		);
	}

	const html = await response.text();
	const proseMatch = html.match(
		/<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
	);
	if (!proseMatch) {
		return NextResponse.json(
			{ error: "Could not extract skill content from skills.sh page" },
			{ status: 502 },
		);
	}

	const markdownContent = htmlToMarkdown(proseMatch[1]);
	if (!markdownContent) {
		return NextResponse.json(
			{ error: "Parsed skills.sh content was empty" },
			{ status: 502 },
		);
	}

	const description = extractDescription(source, markdownContent);
	const category = inferSkillCategory(skillId, markdownContent);
	const name = skillId.slice(0, 120);

	return NextResponse.json({
		name,
		description,
		category,
		markdownContent,
		sourceUrl,
	});
}
