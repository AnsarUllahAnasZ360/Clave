"use client";

import {
	BookOpen,
	CheckSquare,
	CircleDot,
	FileText,
	FolderKanban,
	type LucideIcon,
	PenLine,
	Users,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export interface SearchResult {
	type: string;
	id: string;
	title: string;
	status?: string;
	identifier?: string;
}

// ── Entity type configuration ────────────────────────────────────────────

type EntityConfig = {
	label: string;
	icon: LucideIcon;
	badgeClass: string;
	/** Route segment: /[workspaceSlug]/[segment]/[id] */
	segment: string;
};

const ENTITY_CONFIG: Record<string, EntityConfig> = {
	issue: {
		label: "Issue",
		icon: CircleDot,
		badgeClass:
			"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
		segment: "issues",
	},
	document: {
		label: "Doc",
		icon: FileText,
		badgeClass:
			"bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
		segment: "docs",
	},
	project: {
		label: "Project",
		icon: FolderKanban,
		badgeClass:
			"bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
		segment: "projects",
	},
	whiteboard: {
		label: "Board",
		icon: PenLine,
		badgeClass:
			"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
		segment: "boards",
	},
	client: {
		label: "Client",
		icon: Users,
		badgeClass:
			"bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
		segment: "clients",
	},
	story: {
		label: "Story",
		icon: BookOpen,
		badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
		segment: "issues",
	},
	task: {
		label: "Task",
		icon: CheckSquare,
		badgeClass:
			"bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
		segment: "tasks",
	},
};

function getEntityConfig(type: string): EntityConfig {
	return (
		ENTITY_CONFIG[type] ?? {
			label: type,
			icon: FileText,
			badgeClass: "bg-muted text-muted-foreground",
			segment: "",
		}
	);
}

// ── Status formatting ────────────────────────────────────────────────────

function formatStatus(status: string): string {
	return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusDot(status: string): string {
	switch (status) {
		case "done":
		case "completed":
		case "active":
			return "text-green-500";
		case "in_progress":
		case "in_review":
			return "text-blue-500";
		case "cancelled":
			return "text-muted-foreground";
		default:
			return "text-amber-500";
	}
}

// ── Build entity URL ─────────────────────────────────────────────────────

export function buildEntityUrl(
	workspaceSlug: string,
	type: string,
	id: string,
): string {
	const config = getEntityConfig(type);
	if (!config.segment) return "#";
	return `/${workspaceSlug}/${config.segment}/${id}`;
}

// ── Component ────────────────────────────────────────────────────────────

export const SearchResultCard = memo(function SearchResultCard({
	result,
	workspaceSlug,
}: {
	result: SearchResult;
	workspaceSlug: string;
}) {
	const config = getEntityConfig(result.type);
	const Icon = config.icon;
	const url = buildEntityUrl(workspaceSlug, result.type, result.id);

	return (
		<Link
			href={url as Route}
			prefetch={false}
			className={cn(
				"flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5",
				"transition-colors hover:bg-accent/50 hover:border-border",
				"group",
			)}
		>
			{/* Entity type badge */}
			<Badge
				variant="secondary"
				className={cn(
					"shrink-0 gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
					config.badgeClass,
				)}
			>
				<Icon className="size-3" />
				{config.label}
			</Badge>

			{/* Title + identifier */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					{result.identifier && (
						<span className="shrink-0 text-xs text-muted-foreground font-mono">
							{result.identifier}
						</span>
					)}
					<span className="truncate text-sm font-medium text-foreground group-hover:text-accent-foreground">
						{result.title}
					</span>
				</div>
			</div>

			{/* Status indicator */}
			{result.status && (
				<div className="flex shrink-0 items-center gap-1.5">
					<span
						className={cn("size-1.5 rounded-full", getStatusDot(result.status))}
						style={{ backgroundColor: "currentColor" }}
					/>
					<span className="text-xs text-muted-foreground">
						{formatStatus(result.status)}
					</span>
				</div>
			)}
		</Link>
	);
});
