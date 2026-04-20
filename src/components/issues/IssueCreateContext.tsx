"use client";

import { usePathname } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { IssueTypeKey, PriorityKey, StatusKey } from "@/lib/issue-config";

/**
 * Context for pre-filling issue creation forms.
 * Pass fields from the current view (project page, board column, milestone, etc.)
 */
export interface IssueCreatePreset {
	projectId?: string;
	sprintId?: string;
	listId?: string;
	milestoneId?: string;
	status?: string;
	priority?: string;
	assigneeId?: string;
	assigneeIds?: string[];
	labelIds?: string[];
	/** Source of issue creation for formatting hints (e.g., "document" for plain text descriptions) */
	source?: "document" | "project" | "board" | "tasks";
}

/**
 * Shared form state for issue creation modals.
 * Lifted to context so both compact and full modals share state on mode switch.
 */
export interface IssueFormState {
	title: string;
	description: string;
	status: StatusKey;
	priority: PriorityKey;
	issueType: IssueTypeKey;
	projectId: string | undefined;
	sprintId: string | undefined;
	listId: string | undefined;
	milestoneId: string | undefined;
	assigneeIds: string[];
	labelIds: string[];
	estimate: string;
	dueDate: Date | undefined;
	createMore: boolean;
}

const DEFAULT_FORM_STATE: IssueFormState = {
	title: "",
	description: "",
	status: "backlog",
	priority: "no_priority",
	issueType: "issue",
	projectId: undefined,
	sprintId: undefined,
	listId: undefined,
	milestoneId: undefined,
	assigneeIds: [],
	labelIds: [],
	estimate: "0",
	dueDate: undefined,
	createMore: false,
};

interface IssueCreateContextValue {
	/** Open the quick create modal (C shortcut) */
	openQuickCreate: (preset?: IssueCreatePreset) => void;
	/** Open the full-screen create modal (V shortcut) */
	openFullCreate: (preset?: IssueCreatePreset) => void;
	/** Close any open create modal */
	closeCreate: () => void;
	/** Switch between quick and full mode, preserving form state */
	switchMode: (mode: "quick" | "full") => void;
	/** Which modal is currently open */
	activeModal: "quick" | "full" | null;
	/** Pre-filled context for the active modal */
	preset: IssueCreatePreset;
	/** Shared form state */
	formState: IssueFormState;
	/** Update one or more form fields */
	updateForm: (updates: Partial<IssueFormState>) => void;
	/** Reset form to defaults (preserves createMore) */
	resetFormKeepProperties: () => void;
}

const IssueCreateCtx = createContext<IssueCreateContextValue | null>(null);

export function useIssueCreate() {
	const ctx = useContext(IssueCreateCtx);
	if (!ctx) {
		throw new Error(
			"useIssueCreate must be used within an IssueCreateProvider",
		);
	}
	return ctx;
}

export function useIssueCreateOptional() {
	return useContext(IssueCreateCtx);
}

export function IssueCreateProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [activeModal, setActiveModal] = useState<"quick" | "full" | null>(null);
	const [preset, setPreset] = useState<IssueCreatePreset>({});
	const [formState, setFormState] =
		useState<IssueFormState>(DEFAULT_FORM_STATE);

	// Track current pathname in a ref so the shortcut handler (mounted once
	// at provider init) always reads the latest URL without re-registering.
	const pathname = usePathname();
	const pathnameRef = useRef(pathname);
	useEffect(() => {
		pathnameRef.current = pathname;
	}, [pathname]);

	/**
	 * Infer sprint context from the current route. Sprint detail URLs look
	 * like `/{workspace}/projects/{projectSlug}/sprints/{sprintId}` — when a
	 * caller doesn't specify a sprintId AND didn't pre-scope to a different
	 * project, we auto-attach the visible sprint so the generic "+" flow
	 * lands in the right place.
	 */
	const enrichFromRoute = useCallback(
		(p: IssueCreatePreset): IssueCreatePreset => {
			if (p.sprintId) return p;
			// Don't infer across projects — if the caller pinned a project,
			// we can't safely attach a sprint from a possibly different URL.
			if (p.projectId) return p;
			// `usePathname()` returns null outside the app router context
			// (e.g. unit tests, storybook). Guard rather than crash.
			const current = pathnameRef.current;
			if (!current) return p;
			const match = current.match(/\/sprints\/([^/?#]+)/);
			if (!match) return p;
			return { ...p, sprintId: match[1] };
		},
		[],
	);

	const updateForm = useCallback((updates: Partial<IssueFormState>) => {
		setFormState((prev) => ({ ...prev, ...updates }));
	}, []);

	const applyPreset = useCallback((p: IssueCreatePreset) => {
		const presetAssigneeIds =
			p.assigneeIds && p.assigneeIds.length > 0
				? p.assigneeIds
				: p.assigneeId
					? [p.assigneeId]
					: [];
		setFormState({
			...DEFAULT_FORM_STATE,
			status: (p.status as StatusKey) ?? "backlog",
			priority: (p.priority as PriorityKey) ?? "no_priority",
			projectId: p.projectId,
			sprintId: p.sprintId ?? p.milestoneId,
			listId: p.listId,
			milestoneId: p.milestoneId,
			assigneeIds: presetAssigneeIds,
			labelIds: p.labelIds ?? [],
		});
	}, []);

	const openQuickCreate = useCallback(
		(p?: IssueCreatePreset) => {
			const pr = enrichFromRoute(p ?? {});
			setPreset(pr);
			applyPreset(pr);
			setActiveModal("quick");
		},
		[applyPreset, enrichFromRoute],
	);

	const openFullCreate = useCallback(
		(p?: IssueCreatePreset) => {
			const pr = enrichFromRoute(p ?? {});
			setPreset(pr);
			applyPreset(pr);
			setActiveModal("full");
		},
		[applyPreset, enrichFromRoute],
	);

	const closeCreate = useCallback(() => {
		setActiveModal(null);
		setPreset({});
		setFormState(DEFAULT_FORM_STATE);
	}, []);

	const switchMode = useCallback((mode: "quick" | "full") => {
		setActiveModal(mode);
	}, []);

	const resetFormKeepProperties = useCallback(() => {
		setFormState((prev) => ({
			...prev,
			title: "",
			description: "",
		}));
	}, []);

	// Global keyboard shortcuts: C (quick create), V (full create)
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey) return;

			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.tagName === "SELECT" ||
				target.isContentEditable
			) {
				return;
			}

			if (document.querySelector("[role='dialog']")) return;

			if (e.key === "c" || e.key === "C") {
				e.preventDefault();
				const pr = enrichFromRoute({});
				setPreset(pr);
				applyPreset(pr);
				setActiveModal("quick");
			}

			if (e.key === "v" || e.key === "V") {
				e.preventDefault();
				const pr = enrichFromRoute({});
				setPreset(pr);
				applyPreset(pr);
				setActiveModal("full");
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [enrichFromRoute, applyPreset]);

	const value = useMemo(
		() => ({
			openQuickCreate,
			openFullCreate,
			closeCreate,
			switchMode,
			activeModal,
			preset,
			formState,
			updateForm,
			resetFormKeepProperties,
		}),
		[
			openQuickCreate,
			openFullCreate,
			closeCreate,
			switchMode,
			activeModal,
			preset,
			formState,
			updateForm,
			resetFormKeepProperties,
		],
	);

	return (
		<IssueCreateCtx.Provider value={value}>{children}</IssueCreateCtx.Provider>
	);
}
