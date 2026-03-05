"use client";

import { createContext, useContext } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

interface WorkspaceContextValue {
	workspaceId: Id<"workspaces">;
	workspaceSlug: string;
	workspaceName: string;

	logoUrl?: string | null;
	isDemo?: boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
	null,
);

export function WorkspaceProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: WorkspaceContextValue;
}) {
	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace() {
	const context = useContext(WorkspaceContext);
	if (!context) {
		throw new Error("useWorkspace must be used within a WorkspaceProvider");
	}
	return context;
}

export function useWorkspaceOptional() {
	return useContext(WorkspaceContext);
}
