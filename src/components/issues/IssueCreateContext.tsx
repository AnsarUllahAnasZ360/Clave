"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
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
	milestoneId?: string;
	status?: string;
	assigneeId?: string;
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
	milestoneId: string | undefined;
	assigneeId: string | undefined;
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
	milestoneId: undefined,
	assigneeId: undefined,
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

	const updateForm = useCallback((updates: Partial<IssueFormState>) => {
		setFormState((prev) => ({ ...prev, ...updates }));
	}, []);

	const applyPreset = useCallback((p: IssueCreatePreset) => {
		setFormState({
			...DEFAULT_FORM_STATE,
			status: (p.status as StatusKey) ?? "backlog",
			projectId: p.projectId,
			sprintId: p.sprintId ?? p.milestoneId,
			milestoneId: p.milestoneId,
			assigneeId: p.assigneeId,
		});
	}, []);

	const openQuickCreate = useCallback(
		(p?: IssueCreatePreset) => {
			const pr = p ?? {};
			setPreset(pr);
			applyPreset(pr);
			setActiveModal("quick");
		},
		[applyPreset],
	);

	const openFullCreate = useCallback(
		(p?: IssueCreatePreset) => {
			const pr = p ?? {};
			setPreset(pr);
			applyPreset(pr);
			setActiveModal("full");
		},
		[applyPreset],
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
				setPreset({});
				setFormState(DEFAULT_FORM_STATE);
				setActiveModal("quick");
			}

			if (e.key === "v" || e.key === "V") {
				e.preventDefault();
				setPreset({});
				setFormState(DEFAULT_FORM_STATE);
				setActiveModal("full");
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

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
