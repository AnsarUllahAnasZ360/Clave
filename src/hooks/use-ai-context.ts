"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useWorkspace } from "@/components/providers/workspace-context";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types ─────────────────────────────────────────────────────────────────

/** Entity detail routes (fetch specific data) */
type EntityContextType = "project" | "issue" | "document" | "board" | "client";

/** Page-level routes (static summary, no entity fetch) */
type PageContextType =
	| "tasks"
	| "inbox"
	| "analytics"
	| "clients"
	| "settings"
	| "notes"
	| "files"
	| "projects-list"
	| "boards-list"
	| "issues-list"
	| "docs-list"
	| "dashboard";

export type AIContextType = EntityContextType | PageContextType | null;

export type AIContext = {
	type: NonNullable<AIContextType>;
	entityId: string;
	entityName: string;
	/** Short summary for the system prompt, e.g. "Project 'Alpha' (active)" */
	summary: string;
};

// ── Page Route Summaries ─────────────────────────────────────────────────

const PAGE_ROUTE_INFO: Record<
	PageContextType,
	{ name: string; summary: string }
> = {
	tasks: {
		name: "My Issues",
		summary:
			"The user is on their My Issues page, viewing their assigned tasks and issues.",
	},
	inbox: {
		name: "Inbox",
		summary:
			"The user is on their Inbox page, viewing notifications and mentions.",
	},
	analytics: {
		name: "Analytics",
		summary:
			"The user is on the Analytics/Performance page, viewing workspace metrics.",
	},
	clients: {
		name: "Clients",
		summary: "The user is on the Clients page, viewing CRM contacts.",
	},
	settings: {
		name: "Settings",
		summary:
			"The user is on the Settings page, managing workspace configuration.",
	},
	notes: {
		name: "Notes",
		summary: "The user is on the Notes page, viewing workspace notes.",
	},
	files: {
		name: "Files",
		summary:
			"The user is on the Files page, viewing uploaded files and assets.",
	},
	"projects-list": {
		name: "Projects",
		summary:
			"The user is on the Projects page, viewing all workspace projects.",
	},
	"boards-list": {
		name: "Boards",
		summary:
			"The user is on the Boards page, viewing all workspace whiteboards.",
	},
	"issues-list": {
		name: "Issues",
		summary: "The user is on the Issues page, viewing all workspace issues.",
	},
	"docs-list": {
		name: "Docs",
		summary: "The user is on the Docs page, viewing all workspace documents.",
	},
	dashboard: {
		name: "Dashboard",
		summary: "The user is on the workspace dashboard.",
	},
};

// ── Route Parsing ─────────────────────────────────────────────────────────

type ParsedRoute = {
	type: NonNullable<AIContextType>;
	id: string;
};

/** Maps top-level path segments to page-level context types */
const SEGMENT_TO_PAGE_TYPE: Record<string, PageContextType> = {
	tasks: "tasks",
	inbox: "inbox",
	analytics: "analytics",
	settings: "settings",
	notes: "notes",
	files: "files",
	projects: "projects-list",
	boards: "boards-list",
	issues: "issues-list",
	docs: "docs-list",
	clients: "clients",
};

function parseRoute(
	pathname: string,
	workspaceSlug: string,
): ParsedRoute | null {
	const prefix = `/${workspaceSlug}/`;
	if (!pathname.startsWith(prefix)) return null;

	const rest = pathname.slice(prefix.length);

	// ── Entity detail routes (with specific ID) ──────────────────────

	// /projects/[id] or /projects/[id]/backlog
	if (rest.startsWith("projects/")) {
		const slug = rest.split("/")[1];
		if (slug) return { type: "project", id: slug };
	}

	// /issues/[id]
	if (rest.startsWith("issues/")) {
		const identifier = rest.split("/")[1];
		if (identifier) return { type: "issue", id: identifier };
	}

	// /docs/[id]
	if (rest.startsWith("docs/")) {
		const id = rest.split("/")[1];
		if (id) return { type: "document", id };
	}

	// /boards/[id]
	if (rest.startsWith("boards/")) {
		const id = rest.split("/")[1];
		if (id) return { type: "board", id };
	}

	// /clients/[id]
	if (rest.startsWith("clients/")) {
		const id = rest.split("/")[1];
		if (id) return { type: "client", id };
	}

	// ── Page-level routes (no entity fetch needed) ───────────────────

	const segment = rest.split("/")[0];

	if (segment && segment in SEGMENT_TO_PAGE_TYPE) {
		return { type: SEGMENT_TO_PAGE_TYPE[segment], id: "" };
	}

	// Workspace root (empty rest)
	if (!rest) {
		return { type: "dashboard", id: "" };
	}

	return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────

function isPageRoute(
	type: NonNullable<AIContextType>,
): type is PageContextType {
	return type in PAGE_ROUTE_INFO;
}

export function useAIContext(): AIContext | null {
	const pathname = usePathname();
	const { workspaceId, workspaceSlug } = useWorkspace();

	const parsed = useMemo(
		() => parseRoute(pathname, workspaceSlug),
		[pathname, workspaceSlug],
	);

	// Fetch entity data based on context type.
	// Only one of these will be active at a time; the rest use "skip".
	const project = useQuery(
		api.projects.getBySlug,
		parsed?.type === "project" ? { workspaceId, slug: parsed.id } : "skip",
	);

	const issue = useQuery(
		api.issues.getByIdentifier,
		parsed?.type === "issue" ? { workspaceId, identifier: parsed.id } : "skip",
	);

	const document = useQuery(
		api.documents.getById,
		parsed?.type === "document"
			? { documentId: parsed.id as Id<"documents"> }
			: "skip",
	);

	const board = useQuery(
		api.whiteboards.getById,
		parsed?.type === "board"
			? { whiteboardId: parsed.id as Id<"whiteboards"> }
			: "skip",
	);

	const client = useQuery(
		api.clients.getById,
		parsed?.type === "client"
			? { clientId: parsed.id as Id<"clients"> }
			: "skip",
	);

	return useMemo(() => {
		if (!parsed) return null;

		// Page-level routes return static context (no entity to fetch)
		if (isPageRoute(parsed.type)) {
			const info = PAGE_ROUTE_INFO[parsed.type];
			return {
				type: parsed.type,
				entityId: "",
				entityName: info.name,
				summary: info.summary,
			};
		}

		// Entity detail routes
		switch (parsed.type) {
			case "project": {
				if (!project) return null;
				return {
					type: "project",
					entityId: String(project._id),
					entityName: project.name,
					summary: `You are viewing the project '${project.name}'. Status: ${project.status ?? "active"}.${project.summary ? ` Summary: ${project.summary}` : ""}`,
				};
			}
			case "issue": {
				if (!issue) return null;
				return {
					type: "issue",
					entityId: String(issue._id),
					entityName: issue.identifier,
					summary: `You are viewing issue ${issue.identifier}: '${issue.title}'. Status: ${issue.status ?? "unknown"}.${issue.priority ? ` Priority: ${issue.priority}.` : ""}`,
				};
			}
			case "document": {
				if (!document) return null;
				return {
					type: "document",
					entityId: String(document._id),
					entityName: document.title || "Untitled",
					summary: `You are viewing the document '${document.title || "Untitled"}'.`,
				};
			}
			case "board": {
				if (!board) return null;
				return {
					type: "board",
					entityId: String(board._id),
					entityName: board.title,
					summary: `You are viewing the whiteboard '${board.title}'.`,
				};
			}
			case "client": {
				if (!client) return null;
				return {
					type: "client",
					entityId: String(client._id),
					entityName: client.name,
					summary: `You are viewing client '${client.name}'. Status: ${client.status}.${client.industry ? ` Industry: ${client.industry}.` : ""}`,
				};
			}
			default:
				return null;
		}
	}, [parsed, project, issue, document, board, client]);
}
