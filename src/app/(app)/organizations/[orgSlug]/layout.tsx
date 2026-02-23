"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { OrganizationProvider } from "@/components/providers/organization-context";
import { api } from "../../../../../convex/_generated/api";

export default function OrganizationDetailLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams();
	const orgSlug = params.orgSlug as string;
	const setActiveContext = useMutation(api.users.setActiveContext);

	const organization = useQuery(api.organizations.getBySlug, { slug: orgSlug });
	const myRole = useQuery(
		api.organizationMembers.myRole,
		organization ? { organizationId: organization._id } : "skip",
	);
	const logoUrl = useQuery(
		api.organizations.getLogoUrl,
		organization ? { organizationId: organization._id } : "skip",
	);
	const organizationId = organization?._id;
	const hasOrgAccess = myRole !== undefined && myRole !== null;

	useEffect(() => {
		if (!organizationId || !hasOrgAccess) return;
		void setActiveContext({ organizationId }).catch(() => {
			// Non-blocking: context persistence should not block page rendering.
		});
	}, [organizationId, hasOrgAccess, setActiveContext]);

	if (organization === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (organization === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
				<h1 className="text-2xl font-semibold">Organization not available</h1>
				<p className="max-w-md text-sm text-muted-foreground">
					You don&apos;t have access to this organization, or it no longer
					exists.
				</p>
				<a
					href="/organizations"
					className="text-sm font-medium text-primary underline underline-offset-4"
				>
					Back to organizations
				</a>
			</div>
		);
	}

	if (myRole === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (myRole === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
				<h1 className="text-2xl font-semibold">Organization not available</h1>
				<p className="max-w-md text-sm text-muted-foreground">
					You don&apos;t have access to this organization, or it no longer
					exists.
				</p>
				<a
					href="/organizations"
					className="text-sm font-medium text-primary underline underline-offset-4"
				>
					Back to organizations
				</a>
			</div>
		);
	}

	return (
		<OrganizationProvider
			value={{
				organizationId: organization._id,
				orgSlug: organization.slug,
				orgName: organization.name,
				logoUrl: logoUrl ?? null,
			}}
		>
			{children}
		</OrganizationProvider>
	);
}
