"use client";

import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { OrganizationProvider } from "@/components/providers/organization-context";
import { Skeleton } from "@/components/ui/skeleton";
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
			<div className="flex min-h-screen">
				<div className="w-64 shrink-0 border-r border-border p-4 space-y-4">
					<Skeleton className="h-8 w-32" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-1/2" />
				</div>
				<div className="flex-1 p-6 space-y-4">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-px w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
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
