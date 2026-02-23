"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

export type AgentMentionItem = {
	id: string;
	name: string;
	description: string;
	avatar?: string;
	isShared: boolean;
	isPreset: boolean;
};

export type AgentMentionGroup = "personal" | "shared" | "presets";

export type GroupedAgents = {
	personal: AgentMentionItem[];
	shared: AgentMentionItem[];
	presets: AgentMentionItem[];
};

export type UseAgentMentionsReturn = {
	agents: AgentMentionItem[];
	grouped: GroupedAgents;
	isLoading: boolean;
};

// ── Hook ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to workspace sub-agents and filter by search term.
 * Returns flat list and grouped by type (personal, shared, presets).
 */
export function useAgentMentions(
	workspaceId: Id<"workspaces">,
	searchTerm: string,
): UseAgentMentionsReturn {
	const allAgents = useQuery(api.ai.subAgents.list, { workspaceId });
	const isLoading = allAgents === undefined;

	const { agents, grouped } = useMemo(() => {
		if (!allAgents) {
			return {
				agents: [] as AgentMentionItem[],
				grouped: {
					personal: [],
					shared: [],
					presets: [],
				} as GroupedAgents,
			};
		}

		const term = searchTerm.trim().toLowerCase();
		const filtered: AgentMentionItem[] = allAgents
			.filter(
				(a: { name: string }) => !term || a.name.toLowerCase().includes(term),
			)
			.map((a: (typeof allAgents)[number]) => ({
				id: a._id,
				name: a.name,
				description: a.description,
				avatar: a.avatar,
				isShared: a.isShared,
				isPreset: a.isPreset,
			}));

		const grouped: GroupedAgents = {
			personal: filtered.filter((a) => !a.isShared && !a.isPreset),
			shared: filtered.filter((a) => a.isShared && !a.isPreset),
			presets: filtered.filter((a) => a.isPreset),
		};

		return { agents: filtered, grouped };
	}, [allAgents, searchTerm]);

	return { agents, grouped, isLoading };
}
