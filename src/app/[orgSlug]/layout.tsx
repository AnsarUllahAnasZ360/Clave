"use client";

import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { OrganizationProvider } from "@/components/providers/organization-context";
import { api } from "../../../convex/_generated/api";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
	const params = useParams();
	const router = useRouter();
	const orgSlug = params.orgSlug as string;

	const org = useQuery(api.organizations.getBySlug, { slug: orgSlug });
	const orgLogoUrl = useQuery(
		api.organizations.getLogoUrl,
		org ? { organizationId: org._id } : "skip",
	);

	// Still loading
	if (org === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	// Org not found
	if (org === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4">
				<h1 className="text-2xl font-semibold">Organization not found</h1>
				<p className="text-muted-foreground">
					The organization &ldquo;{orgSlug}&rdquo; does not exist or you don't
					have access.
				</p>
				<button
					type="button"
					className="text-sm text-primary underline cursor-pointer"
					onClick={() => router.push("/")}
				>
					Go to home
				</button>
			</div>
		);
	}

	return (
		<OrganizationProvider
			value={{
				organizationId: org._id,
				orgSlug: org.slug,
				orgName: org.name,
				logoUrl: orgLogoUrl ?? null,
			}}
		>
			{children}
		</OrganizationProvider>
	);
}
