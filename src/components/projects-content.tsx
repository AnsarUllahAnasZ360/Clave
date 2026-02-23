"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProjectCardsView } from "@/components/project-cards-view";
import { ProjectHeader } from "@/components/project-header";
import { ProjectQuickCreateModal } from "@/components/projects/ProjectQuickCreateModal";
import type { FilterCounts, Project } from "@/lib/data/projects";
import { chipsToParams, paramsToChips } from "@/lib/url/filters";
import {
	DEFAULT_VIEW_OPTIONS,
	type FilterChip,
	type ViewOptions,
} from "@/lib/view-options";
import { api } from "../../convex/_generated/api";
import { useWorkspace } from "./providers/workspace-context";
import { useWorkspaceProjects } from "./providers/workspace-data-context";

function computeFilterCountsFromList(list: Project[]): FilterCounts {
	const res: FilterCounts = {
		status: {},
		priority: {},
		tags: {},
		members: {},
	};
	for (const p of list) {
		res.status![p.status] = (res.status?.[p.status] || 0) + 1;
		res.priority![p.priority] = (res.priority?.[p.priority] || 0) + 1;
		for (const t of p.tags) {
			const id = t.toLowerCase();
			res.tags![id] = (res.tags?.[id] || 0) + 1;
		}
		if (p.members.length === 0) {
			res.members!["no-member"] = (res.members?.["no-member"] || 0) + 1;
		}
		if (p.members.length > 0) {
			res.members!.current = (res.members?.current || 0) + 1;
		}
	}
	return res;
}

export function ProjectsContent() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { workspaceId } = useWorkspace();

	const rawProjects = useWorkspaceProjects();
	const projectSummaries = useQuery(api.projects.getWorkspaceProjectSummaries, {
		workspaceId,
	});
	const allClients = useQuery(api.clients.list, { workspaceId });
	const [viewOptions, setViewOptions] =
		useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);

	const [filters, setFilters] = useState<FilterChip[]>([]);

	const [isWizardOpen, setIsWizardOpen] = useState(false);

	const isSyncingRef = useRef(false);
	const prevParamsRef = useRef<string>("");

	const openWizard = () => {
		setIsWizardOpen(true);
	};

	const closeWizard = () => {
		setIsWizardOpen(false);
	};

	const removeFilter = (key: string, value: string) => {
		const next = filters.filter((f) => !(f.key === key && f.value === value));
		setFilters(next);
		replaceUrlFromChips(next);
	};

	const applyFilters = (chips: FilterChip[]) => {
		setFilters(chips);
		replaceUrlFromChips(chips);
	};

	useEffect(() => {
		const currentParams = searchParams.toString();

		if (prevParamsRef.current === currentParams) return;

		if (isSyncingRef.current) {
			isSyncingRef.current = false;
			return;
		}

		prevParamsRef.current = currentParams;
		const params = new URLSearchParams(searchParams.toString());
		const chips = paramsToChips(params);
		setFilters(chips);
	}, [searchParams]);

	const replaceUrlFromChips = (chips: FilterChip[]) => {
		const params = chipsToParams(chips);
		const qs = params.toString();
		const url = qs ? `${pathname}?${qs}` : pathname;

		isSyncingRef.current = true;
		prevParamsRef.current = qs;
		router.replace(url as never, { scroll: false });
	};

	// Build client lookup map
	const clientMap = useMemo(() => {
		const map = new Map<string, string>();
		if (allClients) {
			for (const c of allClients) {
				map.set(c._id, c.name);
			}
		}
		return map;
	}, [allClients]);

	// Map Convex projects to the frontend Project type
	const projects: Project[] = useMemo(() => {
		if (!rawProjects) return [];
		return rawProjects.map((p) => {
			const summary = projectSummaries?.[p._id];
			const issueCount = summary?.issueCount ?? 0;
			const doneCount = summary?.doneCount ?? 0;
			const progress =
				issueCount > 0 ? Math.round((doneCount / issueCount) * 100) : 0;
			const memberNames = (summary?.members ?? [])
				.map((m) => m.name)
				.filter((n): n is string => n !== null);

			return {
				id: p._id,
				slug: p.slug,
				name: p.name,
				summary: p.summary,
				icon: p.icon,
				taskCount: issueCount,
				progress,
				startDate: p.startDate ? new Date(p.startDate) : new Date(),
				endDate: p.endDate ? new Date(p.endDate) : new Date(),
				status: p.status as Project["status"],
				priority:
					p.priority === "no_priority"
						? "low"
						: (p.priority as Project["priority"]),
				tags: p.tags ?? [],
				members: memberNames,
				client: p.clientId ? clientMap.get(p.clientId) : undefined,
				typeLabel: p.typeLabel,
				durationLabel: undefined,
				tasks: [],
			};
		});
	}, [rawProjects, projectSummaries, clientMap]);

	const filteredProjects = useMemo(() => {
		let list = projects.slice();

		if (!viewOptions.showClosedProjects) {
			list = list.filter(
				(p) => p.status !== "completed" && p.status !== "cancelled",
			);
		}

		const statusSet = new Set<string>();
		const prioritySet = new Set<string>();
		const tagSet = new Set<string>();
		const memberSet = new Set<string>();

		for (const { key, value } of filters) {
			const k = key.trim().toLowerCase();
			const v = value.trim().toLowerCase();
			if (k.startsWith("status")) statusSet.add(v);
			else if (k.startsWith("priority")) prioritySet.add(v);
			else if (k.startsWith("tag")) tagSet.add(v);
			else if (k === "pic" || k.startsWith("member")) memberSet.add(v);
		}

		if (statusSet.size)
			list = list.filter((p) => statusSet.has(p.status.toLowerCase()));
		if (prioritySet.size)
			list = list.filter((p) => prioritySet.has(p.priority.toLowerCase()));
		if (tagSet.size)
			list = list.filter((p) =>
				p.tags.some((t) => tagSet.has(t.toLowerCase())),
			);
		if (memberSet.size) {
			const members = Array.from(memberSet);
			list = list.filter((p) =>
				p.members.some((m) =>
					members.some((mv) => m.toLowerCase().includes(mv)),
				),
			);
		}

		const sorted = list.slice();
		if (viewOptions.ordering === "alphabetical")
			sorted.sort((a, b) => a.name.localeCompare(b.name));
		if (viewOptions.ordering === "date")
			sorted.sort(
				(a, b) => (a.endDate?.getTime() || 0) - (b.endDate?.getTime() || 0),
			);
		return sorted;
	}, [filters, viewOptions, projects]);

	const isLoading = rawProjects === undefined;

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
			<ProjectHeader
				filters={filters}
				onRemoveFilter={removeFilter}
				onFiltersChange={applyFilters}
				counts={computeFilterCountsFromList(filteredProjects)}
				viewOptions={viewOptions}
				onViewOptionsChange={setViewOptions}
				onAddProject={openWizard}
			/>
			<ProjectCardsView
				projects={filteredProjects}
				loading={isLoading}
				onCreateProject={openWizard}
			/>
			<ProjectQuickCreateModal open={isWizardOpen} onClose={closeWizard} />
		</div>
	);
}
