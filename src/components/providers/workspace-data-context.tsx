"use client";

import { useQuery } from "convex/react";
import { createContext, useContext, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { useWorkspace } from "./workspace-context";

type CurrentUser = typeof api.users.current._returnType;
type WorkspaceMembers = typeof api.workspaceMembers.list._returnType;
type WorkspaceLabels = typeof api.labels.list._returnType;
type WorkspaceProjects = typeof api.projects.list._returnType;

interface WorkspaceDataContextValue {
	currentUser: CurrentUser;
	workspaceMembers: WorkspaceMembers | undefined;
	workspaceLabels: WorkspaceLabels | undefined;
	workspaceProjects: WorkspaceProjects | undefined;
}

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | null>(
	null,
);

export function WorkspaceDataProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { workspaceId } = useWorkspace();

	const currentUser = useQuery(api.users.current);
	const workspaceMembers = useQuery(api.workspaceMembers.list, {
		workspaceId,
	});
	const workspaceLabels = useQuery(api.labels.list, { workspaceId });
	const workspaceProjects = useQuery(api.projects.list, { workspaceId });

	const value = useMemo(
		() => ({
			currentUser,
			workspaceMembers,
			workspaceLabels,
			workspaceProjects,
		}),
		[currentUser, workspaceMembers, workspaceLabels, workspaceProjects],
	);

	return (
		<WorkspaceDataContext.Provider value={value}>
			{children}
		</WorkspaceDataContext.Provider>
	);
}

export function useCurrentUser() {
	const context = useContext(WorkspaceDataContext);
	if (!context) {
		throw new Error(
			"useCurrentUser must be used within a WorkspaceDataProvider",
		);
	}
	return context.currentUser;
}

export function useWorkspaceMembers() {
	const context = useContext(WorkspaceDataContext);
	if (!context) {
		throw new Error(
			"useWorkspaceMembers must be used within a WorkspaceDataProvider",
		);
	}
	return context.workspaceMembers;
}

export function useWorkspaceLabels() {
	const context = useContext(WorkspaceDataContext);
	if (!context) {
		throw new Error(
			"useWorkspaceLabels must be used within a WorkspaceDataProvider",
		);
	}
	return context.workspaceLabels;
}

export function useWorkspaceProjects() {
	const context = useContext(WorkspaceDataContext);
	if (!context) {
		throw new Error(
			"useWorkspaceProjects must be used within a WorkspaceDataProvider",
		);
	}
	return context.workspaceProjects;
}
