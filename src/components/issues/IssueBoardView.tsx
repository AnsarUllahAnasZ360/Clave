"use client";

import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	rectIntersection,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	type DisplayProperties,
	IssueBoardCard,
	type IssueCardData,
} from "@/components/issues/IssueBoardCard";
import { IssueInlineCreate } from "@/components/issues/IssueInlineCreate";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import { PRIORITY_LABELS, type StatusKey } from "@/lib/issue-config";
import {
	pulseDropTarget,
	resolveSidebarDropTarget,
	setSidebarDragActive,
	subscribeSidebarHover,
} from "@/lib/sidebar-drag";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status configuration (from centralized module) ───────────────────────

export type IssueStatus = StatusKey;

type StatusColumnConfig = {
	id: string;
	label: string;
	icon: LucideIcon;
	colorHex: string;
};

// ── Swimlane grouping ─────────────────────────────────────────────────────

export type SwimlaneSetting =
	| "none"
	| "assignee"
	| "priority"
	| "sprint"
	| "milestone";

type SwimlaneGroup = {
	key: string;
	label: string;
	icon?: React.ReactNode;
};

const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "no_priority"];

// ── Props ─────────────────────────────────────────────────────────────────

/** Defaults applied to inline-create on this board. Used when the parent
 *  view (e.g., My Issues) has active filters that the new issue should
 *  auto-match so it immediately appears in the view. */
export interface IssueBoardCreateDefaults {
	projectId?: string;
	priority?: string;
	assigneeIds?: string[];
	labelIds?: string[];
}

export type IssueBoardViewProps = {
	projectId?: Id<"projects">;
	displayProperties?: DisplayProperties;
	swimlaneBy?: SwimlaneSetting;
	/**
	 * When viewing a sprint-scoped board, pass the sprint so inline create attaches
	 * the issue to that sprint (required for listBySprint and correct column placement).
	 */
	boardSprintId?: Id<"sprints">;
	/** Pre-fetched issues to use instead of internal queries (e.g., from My Issues) */
	externalIssues?: IssueCardData[];
	/** Per-column inline-create defaults mirroring the parent view's filters. */
	createDefaults?: IssueBoardCreateDefaults;
	/** When provided, clicking a card calls this instead of navigating to issue page */
	onIssueClick?: (issueId: string) => void;
};

/** Resolves which sprint id to set when creating from a swimlane cell or sprint-scoped board. */
export function resolveSprintIdForBoardCreate(
	swimlaneBy: SwimlaneSetting,
	swimlaneKey: string,
	boardSprintId?: Id<"sprints">,
): Id<"sprints"> | undefined {
	if (swimlaneBy === "sprint" || swimlaneBy === "milestone") {
		if (swimlaneKey === "__no_sprint__") return undefined;
		return swimlaneKey as Id<"sprints">;
	}
	return boardSprintId;
}

// ── Fractional index helpers ──────────────────────────────────────────────

function computeSortOrder(items: IssueCardData[], overIndex: number): number {
	if (items.length === 0) return 1.0;
	if (overIndex <= 0) return items[0].sortOrder / 2;
	if (overIndex >= items.length) return items[items.length - 1].sortOrder + 1.0;
	const before = items[overIndex - 1].sortOrder;
	const after = items[overIndex].sortOrder;
	return (before + after) / 2;
}

function makeSwimlaneDroppableId(
	status: IssueStatus,
	swimlaneKey: string,
): string {
	return `swimlane:${status}:${encodeURIComponent(swimlaneKey)}`;
}

function parseSwimlaneDroppableId(id: string): {
	status: IssueStatus;
	swimlaneKey: string;
} | null {
	if (!id.startsWith("swimlane:")) return null;
	const parts = id.split(":");
	if (parts.length < 3) return null;
	const status = parts[1] as IssueStatus;
	const swimlaneKey = decodeURIComponent(parts.slice(2).join(":"));
	return { status, swimlaneKey };
}

// ── Main component ────────────────────────────────────────────────────────

export function IssueBoardView({
	projectId,
	displayProperties,
	swimlaneBy = "none",
	boardSprintId,
	externalIssues,
	createDefaults,
	onIssueClick: externalOnIssueClick,
}: IssueBoardViewProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();

	// Load project for custom status merge (if project-scoped board).
	const project = useQuery(
		api.projects.getById,
		projectId ? { projectId } : "skip",
	);
	const effective = useEffectiveIssueConfig(workspaceId, project ?? undefined);
	const STATUS_COLUMNS = effective.statusItems;

	const hasExternalIssues = externalIssues !== undefined;

	// Fetch issues - skip when external issues are provided
	const projectIssues = useQuery(
		api.issues.listByProject,
		hasExternalIssues ? "skip" : projectId ? { projectId } : "skip",
	);
	const workspaceIssues = useQuery(
		api.issues.listByWorkspace,
		hasExternalIssues ? "skip" : projectId ? "skip" : { workspaceId },
	);

	// Resolve to array -- use external issues when provided
	const rawIssues = useMemo(() => {
		if (hasExternalIssues) return externalIssues;
		if (projectId) {
			if (!projectIssues) return undefined;
			return Array.isArray(projectIssues) ? projectIssues : [];
		}
		if (!workspaceIssues) return undefined;
		if ("issues" in workspaceIssues) return workspaceIssues.issues;
		return [];
	}, [
		hasExternalIssues,
		externalIssues,
		projectId,
		projectIssues,
		workspaceIssues,
	]);

	// Fetch workspace members for assignee data
	const members = useWorkspaceMembers();

	// Fetch labels
	const labelsData = useWorkspaceLabels();

	// Fetch sprints for swimlane grouping
	const sprints = useQuery(
		api.sprints.listByProject,
		projectId ? { projectId } : "skip",
	);
	const workspaceSprints = useQuery(
		api.sprints.listByWorkspace,
		projectId ? "skip" : { workspaceId },
	);

	// Mutations
	const updateStatus = useMutation(api.issues.updateStatus);
	const reorderIssue = useMutation(api.issues.reorder);
	const updateIssue = useMutation(api.issues.update);
	const removeIssue = useMutation(api.issues.remove);

	// Build member lookup
	const memberLookup = useMemo(() => {
		if (!members)
			return new Map<string, { name: string; avatarUrl?: string }>();
		const m = new Map<string, { name: string; avatarUrl?: string }>();
		for (const member of members) {
			if (member.user) {
				m.set(member.user._id, {
					name: member.user.name ?? "Unknown",
					avatarUrl: member.user.avatarUrl ?? member.user.image ?? undefined,
				});
			}
		}
		return m;
	}, [members]);

	// Build label lookup
	const labelLookup = useMemo(() => {
		if (!labelsData)
			return new Map<
				string,
				{ _id: Id<"labels">; name: string; color: string }
			>();
		const m = new Map<
			string,
			{ _id: Id<"labels">; name: string; color: string }
		>();
		for (const label of labelsData) {
			m.set(label._id, {
				_id: label._id,
				name: label.name,
				color: label.color,
			});
		}
		return m;
	}, [labelsData]);

	// Local state for optimistic updates
	const [localIssues, setLocalIssues] = useState<IssueCardData[]>([]);
	const [activeItem, setActiveItem] = useState<IssueCardData | null>(null);

	// When the pointer enters a sidebar drop target mid-drag, shrink the
	// DragOverlay so the user can aim at narrow sprint / backlog rows without
	// covering them with the full-width card.
	const [overlayOverSidebar, setOverlayOverSidebar] = useState(false);
	useEffect(() => {
		const unsub = subscribeSidebarHover(setOverlayOverSidebar);
		return unsub;
	}, []);

	function normalizeWheelDeltaY(e: WheelEvent): number {
		if (e.deltaMode === 1) return e.deltaY * 16;
		if (e.deltaMode === 2)
			return e.deltaY * (scrollRef.current?.clientWidth ?? 0);
		return e.deltaY;
	}

	function normalizeWheelDeltaX(e: WheelEvent): number {
		if (e.deltaMode === 1) return e.deltaX * 16;
		if (e.deltaMode === 2)
			return e.deltaX * (scrollRef.current?.clientWidth ?? 0);
		return e.deltaX;
	}

	// Sync from server data
	useEffect(() => {
		if (rawIssues) {
			setLocalIssues(
				rawIssues.map((issue) => ({
					_id: issue._id,
					identifier: issue.identifier,
					title: issue.title,
					status: issue.status,
					priority: issue.priority,
					// Carry both assignee fields so the card can show multi-assignee
					// avatars and the dnd copy stays truthful to the doc.
					assigneeId: issue.assigneeId ?? undefined,
					assigneeIds: issue.assigneeIds ?? undefined,
					labelIds: issue.labelIds ?? undefined,
					dueDate: issue.dueDate ?? undefined,
					estimate: issue.estimate ?? undefined,
					sortOrder: issue.sortOrder,
					projectId: issue.projectId ?? undefined,
					sprintId: issue.sprintId ?? undefined,
					milestoneId: issue.milestoneId ?? undefined,
				})),
			);
		}
	}, [rawIssues]);

	// DnD sensors
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Group issues by status
	const columnGroups = useMemo(() => {
		const groups = new Map<IssueStatus, IssueCardData[]>();
		for (const col of STATUS_COLUMNS) {
			groups.set(col.id, []);
		}
		const fallbackId =
			STATUS_COLUMNS.find((c) => c.id === "backlog")?.id ??
			STATUS_COLUMNS[0]?.id;
		for (const issue of localIssues) {
			const col = groups.get(issue.status as IssueStatus);
			if (col) {
				col.push(issue);
			} else if (fallbackId) {
				groups.get(fallbackId)?.push(issue);
			}
		}
		for (const col of groups.values()) {
			col.sort((a, b) => a.sortOrder - b.sortOrder);
		}
		return groups;
	}, [localIssues, STATUS_COLUMNS]);

	// Find which column an item is in
	const findItemColumn = useCallback(
		(itemId: string): IssueStatus | null => {
			for (const [status, items] of columnGroups.entries()) {
				if (items.some((i) => i._id === itemId)) return status;
			}
			return null;
		},
		[columnGroups],
	);

	const getIssueSwimlaneKey = useCallback(
		(issue: IssueCardData): string | null => {
			if (swimlaneBy === "assignee") {
				return issue.assigneeId ?? "__unassigned__";
			}
			if (swimlaneBy === "priority") {
				return issue.priority;
			}
			if (swimlaneBy === "sprint" || swimlaneBy === "milestone") {
				const sprintLike = issue.sprintId ?? issue.milestoneId;
				return sprintLike ?? "__no_sprint__";
			}
			return null;
		},
		[swimlaneBy],
	);

	// DnD handlers
	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const id = String(event.active.id);
			const item = localIssues.find((i) => i._id === id);
			setActiveItem(item ?? null);
			setSidebarDragActive(true);
		},
		[localIssues],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			setActiveItem(null);
			setSidebarDragActive(false);

			const activeId = String(active.id);

			// Sidebar hit-test runs BEFORE in-view drop handling. dnd-kit's
			// collision detection fires against the dragged card's rect — when
			// the user releases over the sidebar while the card's rect still
			// overlaps a board column, `over` points to that column. Pointer
			// position is the honest signal for "did they aim at the sidebar?".
			const sidebarTarget = resolveSidebarDropTarget(event);
			if (sidebarTarget) {
				// Optimistic removal: most sidebar drops move the issue out of
				// the current board's scope (different project, or out of the
				// backlog/sprint filter). Strip it now so the board tracks the
				// list view's feel. If the filter still matches post-mutation,
				// the sync effect re-adds the card from the refreshed query —
				// worst case is a sub-second flicker for same-scope drops.
				setLocalIssues((prev) => prev.filter((i) => i._id !== activeId));

				if (sidebarTarget.kind === "sprint") {
					void updateIssue({
						issueId: activeId as Id<"issues">,
						projectId: sidebarTarget.projectId as Id<"projects">,
						sprintId: sidebarTarget.sprintId as Id<"sprints">,
					})
						.then(() => {
							toast.success("Moved to sprint");
							pulseDropTarget("sprint", {
								projectId: sidebarTarget.projectId,
								sprintId: sidebarTarget.sprintId,
							});
						})
						.catch(() => toast.error("Failed to move issue"));
				} else if (
					sidebarTarget.kind === "backlog" ||
					sidebarTarget.kind === "project"
				) {
					void updateIssue({
						issueId: activeId as Id<"issues">,
						projectId: sidebarTarget.projectId as Id<"projects">,
						sprintId: null,
						listId: null,
					})
						.then(() => {
							toast.success(
								sidebarTarget.kind === "project"
									? "Moved to project"
									: "Moved to backlog",
							);
							pulseDropTarget(sidebarTarget.kind, {
								projectId: sidebarTarget.projectId,
							});
						})
						.catch(() => toast.error("Failed to move issue"));
				}
				return;
			}

			if (!over) return;

			const overId = String(over.id);

			const sourceStatus = findItemColumn(activeId);
			if (!sourceStatus) return;
			const activeIssue = localIssues.find((i) => i._id === activeId);
			if (!activeIssue) return;
			const sourceSwimlaneKey = getIssueSwimlaneKey(activeIssue);

			// Determine target column/swimlane
			let targetStatus: IssueStatus | null = null;
			let targetSwimlaneKey: string | null = null;

			const parsedCell = parseSwimlaneDroppableId(overId);
			if (parsedCell) {
				targetStatus = parsedCell.status;
				targetSwimlaneKey = parsedCell.swimlaneKey;
			} else if (
				STATUS_COLUMNS.some((c) => c.id === overId) &&
				!localIssues.some((i) => i._id === overId)
			) {
				targetStatus = overId as IssueStatus;
			} else {
				targetStatus = findItemColumn(overId);
				if (swimlaneBy !== "none") {
					const overIssue = localIssues.find((i) => i._id === overId);
					if (overIssue) {
						targetSwimlaneKey = getIssueSwimlaneKey(overIssue);
					}
				}
			}
			if (!targetStatus) return;

			const targetItems =
				swimlaneBy !== "none" && targetSwimlaneKey
					? (columnGroups.get(targetStatus) ?? []).filter(
							(issue) => getIssueSwimlaneKey(issue) === targetSwimlaneKey,
						)
					: (columnGroups.get(targetStatus) ?? []);

			const sameCell =
				sourceStatus === targetStatus &&
				(swimlaneBy === "none" ||
					targetSwimlaneKey === sourceSwimlaneKey ||
					targetSwimlaneKey === null);

			if (sameCell) {
				// Within-column/lane reorder
				const sourceItems = [...targetItems];
				const oldIndex = sourceItems.findIndex((i) => i._id === activeId);
				const overIndex = sourceItems.findIndex((i) => i._id === overId);
				if (oldIndex === -1) return;
				const insertIndex =
					overIndex === -1 ? sourceItems.length - 1 : overIndex;
				if (oldIndex === insertIndex) return;

				const [moved] = sourceItems.splice(oldIndex, 1);
				sourceItems.splice(insertIndex, 0, moved);

				const newSortOrder = computeSortOrder(
					sourceItems.filter((i) => i._id !== activeId),
					insertIndex,
				);

				setLocalIssues((prev) =>
					prev.map((item) =>
						item._id === activeId ? { ...item, sortOrder: newSortOrder } : item,
					),
				);

				reorderIssue({
					issueId: activeId as Id<"issues">,
					newSortOrder,
				}).catch(() => toast.error("Failed to reorder issue"));
			} else {
				// Cross-column/lane move
				const overIndex = targetItems.findIndex((i) => i._id === overId);
				const insertIndex = overIndex === -1 ? targetItems.length : overIndex;
				const newSortOrder = computeSortOrder(targetItems, insertIndex);

				const issuePatch: {
					status: IssueStatus;
					sortOrder: number;
					assigneeId?: Id<"users">;
					priority?: string;
					sprintId?: Id<"sprints">;
					milestoneId?: Id<"milestones">;
				} = {
					status: targetStatus,
					sortOrder: newSortOrder,
				};

				let updatePayload: {
					issueId: Id<"issues">;
					assigneeId?: Id<"users">;
					priority?: "urgent" | "high" | "medium" | "low" | "no_priority";
					sprintId?: Id<"sprints">;
					milestoneId?: Id<"milestones">;
				} | null = null;

				if (
					swimlaneBy !== "none" &&
					targetSwimlaneKey &&
					targetSwimlaneKey !== sourceSwimlaneKey
				) {
					if (swimlaneBy === "assignee") {
						const nextAssignee =
							targetSwimlaneKey === "__unassigned__"
								? undefined
								: (targetSwimlaneKey as Id<"users">);
						issuePatch.assigneeId = nextAssignee;
						updatePayload = {
							issueId: activeId as Id<"issues">,
							assigneeId: nextAssignee,
						};
					}
					if (swimlaneBy === "priority") {
						const nextPriority = targetSwimlaneKey as
							| "urgent"
							| "high"
							| "medium"
							| "low"
							| "no_priority";
						issuePatch.priority = nextPriority;
						updatePayload = {
							issueId: activeId as Id<"issues">,
							priority: nextPriority,
						};
					}
					if (swimlaneBy === "sprint" || swimlaneBy === "milestone") {
						const nextSprint =
							targetSwimlaneKey === "__no_sprint__"
								? undefined
								: (targetSwimlaneKey as Id<"sprints">);
						issuePatch.sprintId = nextSprint;
						if (swimlaneBy === "milestone") {
							issuePatch.milestoneId = undefined;
						}
						updatePayload = {
							issueId: activeId as Id<"issues">,
							sprintId: nextSprint,
							milestoneId: undefined,
						};
					}
				}

				setLocalIssues((prev) =>
					prev.map((item) =>
						item._id === activeId ? { ...item, ...issuePatch } : item,
					),
				);

				const operations: Promise<unknown>[] = [
					reorderIssue({
						issueId: activeId as Id<"issues">,
						newSortOrder,
					}),
				];
				if (targetStatus !== sourceStatus) {
					operations.push(
						updateStatus({
							issueId: activeId as Id<"issues">,
							status: targetStatus as IssueStatus,
						}),
					);
				}
				if (updatePayload) {
					operations.push(updateIssue(updatePayload));
				}

				Promise.all(operations).catch(() =>
					toast.error("Failed to move issue"),
				);
			}
		},
		[
			findItemColumn,
			columnGroups,
			localIssues,
			swimlaneBy,
			getIssueSwimlaneKey,
			updateStatus,
			reorderIssue,
			updateIssue,
		],
	);

	const handleDragCancel = useCallback(() => {
		setActiveItem(null);
		setSidebarDragActive(false);
	}, []);

	// Card click — open sidebar if handler provided, else navigate
	const onCardClick = useCallback(
		(identifier: string) => {
			if (externalOnIssueClick) {
				const issue = rawIssues?.find((i) => i.identifier === identifier);
				if (issue) {
					externalOnIssueClick(issue._id);
					return;
				}
			}
			router.push(`/${workspaceSlug}/issues/${identifier}`);
		},
		[router, workspaceSlug, externalOnIssueClick, rawIssues],
	);

	const onDeleteIssue = useCallback(
		async (issueId: string, identifier: string) => {
			const ok = window.confirm(`Delete ${identifier}? This cannot be undone.`);
			if (!ok) return;
			// Optimistic remove
			setLocalIssues((prev) => prev.filter((i) => i._id !== issueId));
			try {
				await removeIssue({ issueId: issueId as Id<"issues"> });
				toast.success("Issue deleted");
			} catch {
				toast.error("Failed to delete issue");
			}
		},
		[removeIssue],
	);

	const onMoveIssueToBacklog = useCallback(
		async (issueId: string) => {
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					sprintId: null,
					listId: null,
				});
				toast.success("Moved to backlog");
			} catch {
				toast.error("Failed to move to backlog");
			}
		},
		[updateIssue],
	);

	// Scroll edge indicators (must be before any early returns — Rules of Hooks)
	const boardRootRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	// Content wrapper inside the horizontal scroller. We observe this because
	// scrollWidth changes don't trigger ResizeObserver on the scroller itself.
	// Use state+callback ref so we keep observing the *current* node after route
	// transitions/remounts.
	const [scrollContentEl, setScrollContentEl] = useState<HTMLDivElement | null>(
		null,
	);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	// Custom scrollbar state
	const [scrollThumbLeft, setScrollThumbLeft] = useState(0);
	const [scrollThumbWidth, setScrollThumbWidth] = useState(0);
	const [canHScroll, setCanHScroll] = useState(false);
	const trackRef = useRef<HTMLDivElement>(null);
	const isDraggingThumb = useRef(false);
	const dragStartX = useRef(0);
	const dragStartScrollLeft = useRef(0);

	const updateScrollIndicators = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setCanScrollLeft(el.scrollLeft > 8);
		setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);

		// Update custom scrollbar
		const ratio = el.clientWidth / el.scrollWidth;
		const canScroll = el.scrollWidth > el.clientWidth + 1;
		setCanHScroll(canScroll);
		if (canScroll) {
			const trackWidth = trackRef.current?.clientWidth ?? el.clientWidth;
			const thumbW = Math.max(40, ratio * trackWidth);
			const maxThumbLeft = trackWidth - thumbW;
			const scrollFraction = el.scrollLeft / (el.scrollWidth - el.clientWidth);
			setScrollThumbWidth(thumbW);
			setScrollThumbLeft(scrollFraction * maxThumbLeft);
		}
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		// Initial calculation
		updateScrollIndicators();

		// Recalculate after paint to ensure DOM measurements are ready
		const rafId1 = requestAnimationFrame(() => {
			updateScrollIndicators();
			// Some route/tab transitions briefly report 0px widths; a second frame
			// makes the custom scrollbar settle reliably.
			requestAnimationFrame(() => updateScrollIndicators());
		});

		el.addEventListener("scroll", updateScrollIndicators, { passive: true });
		const ro = new ResizeObserver(updateScrollIndicators);
		// Observe both the scroll container size and the content size. The content
		// width can change after data loads / hydration even when the container
		// size doesn't.
		ro.observe(el);
		if (scrollContentEl) ro.observe(scrollContentEl);
		if (trackRef.current) ro.observe(trackRef.current);

		// Also recalculate on window resize
		const handleWindowResize = () => {
			updateScrollIndicators();
		};
		window.addEventListener("resize", handleWindowResize);

		// Recalculate when returning to the page (bfcache) or regaining focus.
		const handleWindowFocus = () => updateScrollIndicators();
		const handlePageShow = () => updateScrollIndicators();
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") updateScrollIndicators();
		};
		window.addEventListener("focus", handleWindowFocus);
		window.addEventListener("pageshow", handlePageShow);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			cancelAnimationFrame(rafId1);
			el.removeEventListener("scroll", updateScrollIndicators);
			ro.disconnect();
			window.removeEventListener("resize", handleWindowResize);
			window.removeEventListener("focus", handleWindowFocus);
			window.removeEventListener("pageshow", handlePageShow);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [updateScrollIndicators, scrollContentEl]);

	// When issues/swimlanes change, force a fresh measurement. This covers the
	// common case where the board mounts before it has real content.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const raf = requestAnimationFrame(() => updateScrollIndicators());
		return () => cancelAnimationFrame(raf);
	}, [updateScrollIndicators]);

	// Wheel → horizontal scroll (My issues style).
	// Implemented at window capture so inner elements can't swallow the event.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const normalizeWheelDeltaY = (e: WheelEvent) => {
			// deltaMode: 0=pixel, 1=line, 2=page
			// Use a conservative line height to keep behavior predictable on Windows.
			if (e.deltaMode === 1) return e.deltaY * 16;
			if (e.deltaMode === 2) return e.deltaY * el.clientWidth;
			return e.deltaY;
		};
		const normalizeWheelDeltaX = (e: WheelEvent) => {
			if (e.deltaMode === 1) return e.deltaX * 16;
			if (e.deltaMode === 2) return e.deltaX * el.clientWidth;
			return e.deltaX;
		};
		const shouldAllowVerticalWheel = (target: HTMLElement, deltaY: number) => {
			const columnScrollable = target.closest(".kanban-column-scroll");
			if (!columnScrollable) return false;
			const element = columnScrollable as HTMLElement;
			if (element.scrollHeight <= element.clientHeight + 1) return false;
			// Keep the wheel vertical only if the column can scroll in that direction.
			if (deltaY < 0) return element.scrollTop > 0;
			if (deltaY > 0)
				return (
					element.scrollTop < element.scrollHeight - element.clientHeight - 1
				);
			return false;
		};
		const handler = (e: WheelEvent) => {
			const root = boardRootRef.current;
			const target = e.target as HTMLElement | null;
			if (!root || !target) return;
			if (!root.contains(target)) return;

			// Only intercept when content overflows horizontally.
			if (el.scrollWidth <= el.clientWidth + 1) return;

			const dy = normalizeWheelDeltaY(e);
			const dx = normalizeWheelDeltaX(e);
			// Some mice (or horizontal wheel tilt) emit deltaX instead of deltaY.
			const primary = dy !== 0 ? dy : dx;

			// If the wheel event is over a column that can scroll in this direction,
			// keep it vertical. Otherwise, treat vertical wheel as horizontal scroll.
			if (!e.shiftKey && shouldAllowVerticalWheel(target, dy)) return;

			// Shift+wheel always maps to horizontal.
			if (primary !== 0) {
				// Some browsers mark wheel events as non-cancelable; still perform the
				// horizontal scroll to match "My issues" behavior.
				if (e.cancelable) e.preventDefault();
				el.scrollLeft += primary;
			}
		};

		window.addEventListener("wheel", handler, {
			passive: false,
			capture: true,
		});
		return () =>
			window.removeEventListener("wheel", handler, { capture: true } as never);
	}, []);

	// Wheel over the custom scrollbar track should scroll horizontally.
	// This is important for mouse users who expect the bottom bar to behave
	// like a horizontal scroll area.
	useEffect(() => {
		const track = trackRef.current;
		const el = scrollRef.current;
		if (!track || !el) return;

		const handler = (e: WheelEvent) => {
			if (el.scrollWidth <= el.clientWidth) return;
			// Normalize deltas for Windows (deltaMode=line/page).
			const dy = normalizeWheelDeltaY(e);
			const dx = normalizeWheelDeltaX(e);
			// Always treat vertical wheel as horizontal scroll while over the track.
			if (dy !== 0) {
				e.preventDefault();
				el.scrollLeft += dy;
			} else if (dx !== 0) {
				e.preventDefault();
				el.scrollLeft += dx;
			}
		};

		track.addEventListener("wheel", handler, { passive: false, capture: true });
		return () => track.removeEventListener("wheel", handler);
	}, []);

	// Custom scrollbar drag handlers
	const handleThumbMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			isDraggingThumb.current = true;
			dragStartX.current = e.clientX;
			dragStartScrollLeft.current = scrollRef.current?.scrollLeft ?? 0;

			const handleMouseMove = (ev: MouseEvent) => {
				if (!isDraggingThumb.current || !scrollRef.current || !trackRef.current)
					return;
				const dx = ev.clientX - dragStartX.current;
				const trackWidth = trackRef.current.clientWidth;
				const thumbW = scrollThumbWidth;
				const maxThumbLeft = trackWidth - thumbW;
				if (maxThumbLeft <= 0) return;
				const scrollRange =
					scrollRef.current.scrollWidth - scrollRef.current.clientWidth;
				scrollRef.current.scrollLeft =
					dragStartScrollLeft.current + (dx / maxThumbLeft) * scrollRange;
			};

			const handleMouseUp = () => {
				isDraggingThumb.current = false;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[scrollThumbWidth],
	);

	// Click on track to jump to position
	const handleTrackClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const el = scrollRef.current;
			const track = trackRef.current;
			if (!el || !track || e.target !== track) return;
			const rect = track.getBoundingClientRect();
			const clickX = e.clientX - rect.left;
			const fraction = clickX / rect.width;
			el.scrollLeft = fraction * (el.scrollWidth - el.clientWidth);
		},
		[],
	);

	// Swimlane groups
	const swimlaneGroups = useMemo((): SwimlaneGroup[] | null => {
		if (swimlaneBy === "none") return null;

		if (swimlaneBy === "assignee") {
			const assigneeIds = new Set<string>();
			let hasUnassigned = false;
			for (const issue of localIssues) {
				if (issue.assigneeId) {
					assigneeIds.add(issue.assigneeId);
				} else {
					hasUnassigned = true;
				}
			}
			const groups: SwimlaneGroup[] = [];
			for (const id of assigneeIds) {
				const member = memberLookup.get(id);
				groups.push({
					key: id,
					label: member?.name ?? "Unknown",
					icon: member ? (
						<Avatar className="size-4">
							{member.avatarUrl ? (
								<AvatarImage src={member.avatarUrl} alt={member.name} />
							) : (
								<AvatarFallback className="text-[8px]">
									{member.name.charAt(0).toUpperCase()}
								</AvatarFallback>
							)}
						</Avatar>
					) : null,
				});
			}
			// Sort by name
			groups.sort((a, b) => a.label.localeCompare(b.label));
			if (hasUnassigned) {
				groups.push({ key: "__unassigned__", label: "Unassigned" });
			}
			return groups;
		}

		if (swimlaneBy === "priority") {
			return PRIORITY_ORDER.map((p) => ({
				key: p,
				label: PRIORITY_LABELS[p] ?? p,
			}));
		}

		const sprintRows = projectId ? sprints : workspaceSprints;
		if ((swimlaneBy === "sprint" || swimlaneBy === "milestone") && sprintRows) {
			const groups: SwimlaneGroup[] = sprintRows.map((m) => ({
				key: m._id,
				label: m.name,
			}));
			groups.push({ key: "__no_sprint__", label: "No sprint" });
			return groups;
		}

		return null;
	}, [
		swimlaneBy,
		localIssues,
		memberLookup,
		sprints,
		workspaceSprints,
		projectId,
	]);

	// Filter issues for a swimlane + status
	const getIssuesForCell = useCallback(
		(status: IssueStatus, swimlaneKey: string | null): IssueCardData[] => {
			const statusIssues = columnGroups.get(status) ?? [];
			if (!swimlaneKey) return statusIssues;

			return statusIssues.filter((issue) => {
				if (swimlaneBy === "assignee") {
					if (swimlaneKey === "__unassigned__") return !issue.assigneeId;
					return issue.assigneeId === swimlaneKey;
				}
				if (swimlaneBy === "priority") {
					return issue.priority === swimlaneKey;
				}
				if (swimlaneBy === "sprint" || swimlaneBy === "milestone") {
					const sprintLike = issue.sprintId ?? issue.milestoneId;
					if (swimlaneKey === "__no_sprint__") return !sprintLike;
					return sprintLike === swimlaneKey;
				}
				return true;
			});
		},
		[columnGroups, swimlaneBy],
	);

	// Loading state
	if (!rawIssues) {
		return <BoardSkeleton />;
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={rectIntersection}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div
				ref={boardRootRef}
				className="relative flex-1 min-h-0 min-w-0 flex flex-col overscroll-contain"
			>
				{/* Scrollable board area */}
				<div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
					{/* Left edge fade */}
					<div
						className={cn(
							"pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10 bg-linear-to-r from-background to-transparent transition-opacity duration-200",
							canScrollLeft ? "opacity-100" : "opacity-0",
						)}
					/>
					{/* Right edge fade */}
					<div
						className={cn(
							"pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10 bg-linear-to-l from-background to-transparent transition-opacity duration-200",
							canScrollRight ? "opacity-100" : "opacity-0",
						)}
					/>

					<div
						ref={scrollRef}
						className="kanban-scrollbar overflow-x-auto overflow-y-hidden h-full min-w-0"
					>
						{swimlaneGroups ? (
							// Swimlane mode: rows of columns
							<div
								ref={setScrollContentEl}
								className="px-4 pb-2 pt-2 space-y-4 min-w-max"
							>
								{/* Column headers (sticky) */}
								<div className="flex gap-3 min-w-max">
									<div className="w-[272px] shrink-0" />{" "}
									{/* Swimlane label spacer */}
									{STATUS_COLUMNS.map((col) => (
										<div key={col.id} className="w-[272px] shrink-0">
											<ColumnHeader
												column={col}
												count={columnGroups.get(col.id)?.length ?? 0}
											/>
										</div>
									))}
								</div>

								{/* Swimlane rows */}
								{swimlaneGroups.map((swimlane) => (
									<SwimlaneRow
										key={swimlane.key}
										swimlane={swimlane}
										columns={STATUS_COLUMNS}
										getIssues={(status) =>
											getIssuesForCell(status, swimlane.key)
										}
										memberLookup={memberLookup}
										labelLookup={labelLookup}
										displayProperties={displayProperties}
										projectId={projectId}
										swimlaneBy={swimlaneBy}
										boardSprintId={boardSprintId}
										createDefaults={createDefaults}
										onCardClick={onCardClick}
										workspaceSlug={workspaceSlug}
										onDeleteIssue={onDeleteIssue}
										onMoveIssueToBacklog={onMoveIssueToBacklog}
									/>
								))}
							</div>
						) : (
							// Flat mode: simple columns
							<div
								ref={setScrollContentEl}
								className="flex gap-3 px-4 pb-2 pt-2 min-w-max h-full"
							>
								{STATUS_COLUMNS.map((column) => {
									const columnItems = columnGroups.get(column.id) ?? [];
									return (
										<BoardColumn
											key={column.id}
											column={column}
											items={columnItems}
											memberLookup={memberLookup}
											labelLookup={labelLookup}
											displayProperties={displayProperties}
											projectId={projectId}
											sprintId={boardSprintId}
											createDefaults={createDefaults}
											onCardClick={onCardClick}
											workspaceSlug={workspaceSlug}
											onDeleteIssue={onDeleteIssue}
											onMoveIssueToBacklog={onMoveIssueToBacklog}
										/>
									);
								})}
							</div>
						)}
					</div>
				</div>

				{/* Custom horizontal scrollbar — always visible */}
				<div
					ref={trackRef}
					className={cn(
						"shrink-0 h-4 mx-4 mb-2 mt-1 rounded-full cursor-pointer relative",
						canHScroll ? "bg-muted" : "bg-muted/30",
					)}
					onClick={handleTrackClick}
					role="slider"
					aria-label="Horizontal scrollbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(
						(scrollThumbLeft / (trackRef.current?.offsetWidth || 1)) * 100,
					)}
					tabIndex={canHScroll ? 0 : -1}
					onKeyDown={(e) => {
						if (!canHScroll) return;
						if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
							e.preventDefault();
							const delta = e.key === "ArrowLeft" ? -50 : 50;
							const target = scrollRef.current;
							if (target) {
								target.scrollLeft += delta;
							}
						}
					}}
				>
					{canHScroll && (
						<button
							type="button"
							className="absolute top-1 bottom-1 rounded-full bg-foreground/40 hover:bg-foreground/60 active:bg-foreground/70 cursor-grab active:cursor-grabbing transition-colors"
							style={{
								left: scrollThumbLeft,
								width: scrollThumbWidth,
							}}
							onMouseDown={handleThumbMouseDown}
							aria-label="Scrollbar thumb"
							tabIndex={-1}
						/>
					)}
				</div>
			</div>

			{/* Drag overlay — `pointer-events-none` is critical for sidebar
			    drops: `document.elementFromPoint` (used by the sidebar hover
			    tracker and drop resolver) returns the topmost element at a
			    point, which would otherwise always be this overlay, never
			    the sidebar node underneath. */}
			<DragOverlay style={{ pointerEvents: "none" }}>
				{activeItem ? (
					<div
						className={cn(
							"shadow-lg rounded-lg pointer-events-none transition-all duration-150 origin-center",
							overlayOverSidebar
								? "scale-[0.45] opacity-80 w-[272px]"
								: "scale-[1.02] opacity-90 w-[272px]",
						)}
					>
						<IssueBoardCard
							issue={activeItem}
							displayProperties={displayProperties}
							issueUrl={`/${workspaceSlug}/issues/${activeItem.identifier}`}
							onDelete={() =>
								onDeleteIssue(activeItem._id, activeItem.identifier)
							}
							assignee={(() => {
								const id =
									activeItem.assigneeId ??
									activeItem.assigneeIds?.[0] ??
									undefined;
								return id ? (memberLookup.get(id) ?? null) : null;
							})()}
							labels={resolveLabels(activeItem, labelLookup)}
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

// ── Column header ─────────────────────────────────────────────────────────

function ColumnHeader({
	column,
	count,
}: {
	column: StatusColumnConfig;
	count: number;
}) {
	const Icon = column.icon;
	return (
		<div className="flex items-center gap-1.5 py-1.5">
			<Icon className="h-4 w-4" style={{ color: column.colorHex }} />
			<span className="text-sm font-medium">{column.label}</span>
			<span className="text-xs text-muted-foreground ml-0.5">{count}</span>
		</div>
	);
}

// ── Board column (flat mode) ──────────────────────────────────────────────

function BoardColumn({
	column,
	items,
	memberLookup,
	labelLookup,
	displayProperties,
	projectId,
	sprintId,
	createDefaults,
	onCardClick,
	workspaceSlug,
	onDeleteIssue,
	onMoveIssueToBacklog,
}: {
	column: StatusColumnConfig;
	items: IssueCardData[];
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	projectId?: Id<"projects">;
	sprintId?: Id<"sprints">;
	createDefaults?: IssueBoardCreateDefaults;
	onCardClick: (identifier: string) => void;
	workspaceSlug: string;
	onDeleteIssue: (issueId: string, identifier: string) => void;
	onMoveIssueToBacklog?: (issueId: string) => void;
}) {
	const { isOver, setNodeRef } = useDroppable({ id: column.id });
	const itemIds = useMemo(() => items.map((i) => i._id), [items]);

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"shrink-0 min-w-[240px] w-[272px] flex flex-col transition-colors rounded-lg",
				isOver && "bg-primary/5",
			)}
		>
			{/* Header */}
			<div className="px-2 pt-1 pb-1 shrink-0">
				<ColumnHeader column={column} count={items.length} />
			</div>

			{/* Cards */}
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className="kanban-column-scroll px-1.5 pb-2 space-y-1.5 flex-1 overflow-y-auto min-h-0">
					{items.length === 0 ? (
						<EmptyColumnState />
					) : (
						items.map((item) => (
							<SortableCard
								key={item._id}
								issue={item}
								memberLookup={memberLookup}
								labelLookup={labelLookup}
								displayProperties={displayProperties}
								onCardClick={onCardClick}
								workspaceSlug={workspaceSlug}
								onDeleteIssue={onDeleteIssue}
								onMoveIssueToBacklog={onMoveIssueToBacklog}
							/>
						))
					)}
				</div>
			</SortableContext>

			{/* Quick add at bottom. On workspace-scoped boards (My Issues,
			    no pinned project) projectId is undefined — the create
			    mutation accepts optional projectId, so the new issue lands
			    workspace-level. `createDefaults` mirrors the parent view's
			    active filters (assignee on My Issues, plus priority/project
			    /labels when those filters are set) so the new issue matches
			    the view and shows up immediately. */}
			<div className="px-1.5 pb-2 mt-auto shrink-0">
				<IssueInlineCreate
					status={column.id}
					projectId={createDefaults?.projectId ?? projectId}
					sprintId={sprintId}
					priority={createDefaults?.priority}
					assigneeIds={createDefaults?.assigneeIds}
					labelIds={createDefaults?.labelIds}
				/>
			</div>
		</div>
	);
}

// ── Swimlane row ──────────────────────────────────────────────────────────

function SwimlaneRow({
	swimlane,
	columns,
	getIssues,
	memberLookup,
	labelLookup,
	displayProperties,
	projectId,
	swimlaneBy,
	boardSprintId,
	createDefaults,
	onCardClick,
	workspaceSlug,
	onDeleteIssue,
	onMoveIssueToBacklog,
}: {
	swimlane: SwimlaneGroup;
	columns: StatusColumnConfig[];
	getIssues: (status: IssueStatus) => IssueCardData[];
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	projectId?: Id<"projects">;
	swimlaneBy: SwimlaneSetting;
	boardSprintId?: Id<"sprints">;
	createDefaults?: IssueBoardCreateDefaults;
	onCardClick: (identifier: string) => void;
	workspaceSlug: string;
	onDeleteIssue: (issueId: string, identifier: string) => void;
	onMoveIssueToBacklog?: (issueId: string) => void;
}) {
	const sprintIdForCreate = resolveSprintIdForBoardCreate(
		swimlaneBy,
		swimlane.key,
		boardSprintId,
	);
	const [collapsed, setCollapsed] = useState(false);

	const totalIssues = useMemo(() => {
		return columns.reduce((sum, col) => sum + getIssues(col.id).length, 0);
	}, [columns, getIssues]);

	return (
		<div className="border border-border/40 rounded-lg overflow-hidden">
			{/* Swimlane header */}
			<button
				type="button"
				className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
				onClick={() => setCollapsed((v) => !v)}
			>
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground transition-transform",
						!collapsed && "rotate-90",
					)}
				/>
				{swimlane.icon}
				<span className="text-sm font-medium">{swimlane.label}</span>
				<span className="text-xs text-muted-foreground">{totalIssues}</span>
			</button>

			{/* Swimlane columns */}
			{!collapsed && (
				<div className="flex gap-3 min-w-max px-4 py-2">
					<div className="w-48 shrink-0" /> {/* Spacer for label alignment */}
					{columns.map((col) => {
						const items = getIssues(col.id);
						return (
							<SwimlaneCell
								key={`${swimlane.key}-${col.id}`}
								columnId={col.id}
								swimlaneKey={swimlane.key}
								items={items}
								memberLookup={memberLookup}
								labelLookup={labelLookup}
								displayProperties={displayProperties}
								projectId={projectId}
								sprintId={sprintIdForCreate}
								createDefaults={createDefaults}
								onCardClick={onCardClick}
								workspaceSlug={workspaceSlug}
								onDeleteIssue={onDeleteIssue}
								onMoveIssueToBacklog={onMoveIssueToBacklog}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ── Swimlane cell ─────────────────────────────────────────────────────────

function SwimlaneCell({
	columnId,
	swimlaneKey,
	items,
	memberLookup,
	labelLookup,
	displayProperties,
	projectId,
	sprintId,
	createDefaults,
	onCardClick,
	workspaceSlug,
	onDeleteIssue,
	onMoveIssueToBacklog,
}: {
	columnId: IssueStatus;
	swimlaneKey: string;
	items: IssueCardData[];
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	projectId?: Id<"projects">;
	sprintId?: Id<"sprints">;
	createDefaults?: IssueBoardCreateDefaults;
	onCardClick: (identifier: string) => void;
	workspaceSlug: string;
	onDeleteIssue: (issueId: string, identifier: string) => void;
	onMoveIssueToBacklog?: (issueId: string) => void;
}) {
	const droppableId = makeSwimlaneDroppableId(columnId, swimlaneKey);
	const { isOver, setNodeRef } = useDroppable({ id: droppableId });
	const itemIds = useMemo(() => items.map((i) => i._id), [items]);

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"w-[272px] shrink-0 min-h-[80px] p-1.5 flex flex-col transition-colors border-r border-border/20 last:border-r-0",
				isOver && "bg-primary/5",
			)}
		>
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className="kanban-column-scroll space-y-1.5 flex-1 overflow-y-auto min-h-[48px]">
					{items.length === 0 ? (
						<EmptyColumnState />
					) : (
						items.map((item) => (
							<SortableCard
								key={item._id}
								issue={item}
								memberLookup={memberLookup}
								labelLookup={labelLookup}
								displayProperties={displayProperties}
								onCardClick={onCardClick}
								workspaceSlug={workspaceSlug}
								onDeleteIssue={onDeleteIssue}
								onMoveIssueToBacklog={onMoveIssueToBacklog}
							/>
						))
					)}
				</div>
			</SortableContext>
			<div className="mt-auto shrink-0 pt-1">
				<IssueInlineCreate
					status={columnId}
					projectId={createDefaults?.projectId ?? projectId}
					sprintId={sprintId}
					priority={createDefaults?.priority}
					assigneeIds={createDefaults?.assigneeIds}
					labelIds={createDefaults?.labelIds}
				/>
			</div>
		</div>
	);
}

// ── Sortable card wrapper ─────────────────────────────────────────────────

function SortableCard({
	issue,
	memberLookup,
	labelLookup,
	displayProperties,
	onCardClick,
	workspaceSlug,
	onDeleteIssue,
	onMoveIssueToBacklog,
}: {
	issue: IssueCardData;
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	onCardClick?: (identifier: string) => void;
	workspaceSlug: string;
	onDeleteIssue: (issueId: string, identifier: string) => void;
	onMoveIssueToBacklog?: (issueId: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: issue._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	// Prefer the legacy single field (which we mirror on every write), but
	// fall back to the first id in `assigneeIds` so half-migrated records
	// still render an avatar on the card.
	const primaryAssigneeId =
		issue.assigneeId ?? issue.assigneeIds?.[0] ?? undefined;
	const assignee = primaryAssigneeId
		? (memberLookup.get(primaryAssigneeId) ?? null)
		: null;

	const labels = resolveLabels(issue, labelLookup);

	return (
		<div
			ref={setNodeRef}
			style={style}
			data-issue-id={issue._id}
			className={cn("transition-opacity", isDragging && "opacity-40")}
			{...attributes}
			{...listeners}
		>
			<IssueBoardCard
				issue={issue}
				displayProperties={displayProperties}
				issueUrl={`/${workspaceSlug}/issues/${issue.identifier}`}
				onDelete={() => onDeleteIssue(issue._id, issue.identifier)}
				onMoveToBacklog={
					onMoveIssueToBacklog
						? () => onMoveIssueToBacklog(issue._id)
						: undefined
				}
				assignee={assignee}
				labels={labels}
				onClick={onCardClick ? () => onCardClick(issue.identifier) : undefined}
			/>
		</div>
	);
}

// ── Empty column state ────────────────────────────────────────────────────

function EmptyColumnState() {
	return (
		<div className="min-h-[80px] flex items-center justify-center p-4">
			<p className="text-xs text-muted-foreground/60 text-center">No issues</p>
		</div>
	);
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function BoardSkeleton() {
	return (
		<div className="overflow-x-auto flex-1 min-h-0 min-w-0">
			<div className="flex gap-3 px-4 pb-4 pt-2 min-w-max h-full">
				{[0, 1, 2, 3, 4].map((col) => (
					<div
						key={col}
						className="shrink-0 w-[272px] p-2 space-y-3 border-r border-border/20 last:border-r-0"
					>
						<div className="flex items-center gap-2">
							<Skeleton className="h-4 w-4 rounded" />
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-3 w-4" />
						</div>
						<div className="space-y-1.5">
							{Array.from({ length: 3 }).map((_, i) => (
								<Skeleton key={`${col}-${i}`} className="h-24 rounded-lg" />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Label resolution helper ───────────────────────────────────────────────

function resolveLabels(
	issue: IssueCardData,
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>,
): { _id: Id<"labels">; name: string; color: string }[] {
	if (!issue.labelIds || issue.labelIds.length === 0) return [];
	return issue.labelIds.map((id) => labelLookup.get(id)).filter(Boolean) as {
		_id: Id<"labels">;
		name: string;
		color: string;
	}[];
}
