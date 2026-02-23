"use client";

import { useQuery } from "convex/react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { api } from "../../convex/_generated/api";

export function useWorkspaceRole() {
	const workspace = useWorkspaceOptional();
	const result = useQuery(
		api.workspaceMembers.myRole,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);

	if (!workspace || result === undefined) {
		return { role: null, isAdmin: false, isMember: false, isLoading: true };
	}

	if (result === null) {
		return { role: null, isAdmin: false, isMember: false, isLoading: false };
	}

	return {
		role: result.role,
		isAdmin: result.role === "admin",
		isMember: result.role === "member",
		isLoading: false,
	};
}
