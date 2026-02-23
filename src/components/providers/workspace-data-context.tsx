"use client";

import { useQuery } from "convex/react";
import { createContext, useContext } from "react";
import { api } from "../../../convex/_generated/api";
import { useWorkspace } from "./workspace-context";

type CurrentUser = typeof api.users.current._returnType;
type WorkspaceMembers = typeof api.workspaceMembers.list._returnType;
type WorkspaceLabels = typeof api.labels.list._returnType;
type WorkspaceProjects = typeof api.projects.list._returnType;

// ── Individual Contexts ─────────────────────────────────────────────────
// Each subscription gets its own context so consumers only re-render when
// their specific data changes — not when unrelated subscriptions update.

const CurrentUserContext = createContext<CurrentUser | undefined>(undefined);
const WorkspaceMembersContext = createContext<
	WorkspaceMembers | undefined | null
>(null);
const WorkspaceLabelsContext = createContext<
	WorkspaceLabels | undefined | null
>(null);
const WorkspaceProjectsContext = createContext<
	WorkspaceProjects | undefined | null
>(null);

// ── Composite Provider ──────────────────────────────────────────────────
// Wraps all 4 individual providers so the layout only renders one component.
// Each inner provider subscribes to exactly one Convex query.

function CurrentUserProvider({ children }: { children: React.ReactNode }) {
	const currentUser = useQuery(api.users.current) ?? null;
	return (
		<CurrentUserContext.Provider value={currentUser}>
			{children}
		</CurrentUserContext.Provider>
	);
}

function WorkspaceMembersProvider({ children }: { children: React.ReactNode }) {
	const { workspaceId } = useWorkspace();
	const workspaceMembers = useQuery(api.workspaceMembers.list, {
		workspaceId,
	});
	return (
		<WorkspaceMembersContext.Provider value={workspaceMembers}>
			{children}
		</WorkspaceMembersContext.Provider>
	);
}

function WorkspaceLabelsProvider({ children }: { children: React.ReactNode }) {
	const { workspaceId } = useWorkspace();
	const workspaceLabels = useQuery(api.labels.list, { workspaceId });
	return (
		<WorkspaceLabelsContext.Provider value={workspaceLabels}>
			{children}
		</WorkspaceLabelsContext.Provider>
	);
}

function WorkspaceProjectsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { workspaceId } = useWorkspace();
	const workspaceProjects = useQuery(api.projects.list, { workspaceId });
	return (
		<WorkspaceProjectsContext.Provider value={workspaceProjects}>
			{children}
		</WorkspaceProjectsContext.Provider>
	);
}

export function WorkspaceDataProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<CurrentUserProvider>
			<WorkspaceMembersProvider>
				<WorkspaceLabelsProvider>
					<WorkspaceProjectsProvider>{children}</WorkspaceProjectsProvider>
				</WorkspaceLabelsProvider>
			</WorkspaceMembersProvider>
		</CurrentUserProvider>
	);
}

// ── Consumer Hooks ──────────────────────────────────────────────────────
// API unchanged — same hook names, same return types.

export function useCurrentUser() {
	const value = useContext(CurrentUserContext);
	if (value === undefined) {
		throw new Error(
			"useCurrentUser must be used within a WorkspaceDataProvider",
		);
	}
	return value;
}

export function useWorkspaceMembers() {
	const value = useContext(WorkspaceMembersContext);
	if (value === null) {
		throw new Error(
			"useWorkspaceMembers must be used within a WorkspaceDataProvider",
		);
	}
	return value;
}

export function useWorkspaceLabels() {
	const value = useContext(WorkspaceLabelsContext);
	if (value === null) {
		throw new Error(
			"useWorkspaceLabels must be used within a WorkspaceDataProvider",
		);
	}
	return value;
}

export function useWorkspaceProjects() {
	const value = useContext(WorkspaceProjectsContext);
	if (value === null) {
		throw new Error(
			"useWorkspaceProjects must be used within a WorkspaceDataProvider",
		);
	}
	return value;
}
