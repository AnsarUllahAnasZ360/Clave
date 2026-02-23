"use client";

import { createContext, useContext } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

interface OrganizationContextValue {
	organizationId: Id<"organizations">;
	orgSlug: string;
	orgName: string;
	logoUrl?: string | null;
}

export const OrganizationContext =
	createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: OrganizationContextValue;
}) {
	return (
		<OrganizationContext.Provider value={value}>
			{children}
		</OrganizationContext.Provider>
	);
}

export function useOrganization() {
	const context = useContext(OrganizationContext);
	if (!context) {
		throw new Error(
			"useOrganization must be used within an OrganizationProvider",
		);
	}
	return context;
}

export function useOrganizationOptional() {
	return useContext(OrganizationContext);
}
