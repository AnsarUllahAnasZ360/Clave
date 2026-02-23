"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
	OrgSettingsPanel,
	type OrgSettingsSectionId,
} from "@/components/organization/OrgSettingsDialog";
import { useOrganization } from "@/components/providers/organization-context";
import { Button } from "@/components/ui/button";
import { api } from "../../../../../../convex/_generated/api";

const validSections: OrgSettingsSectionId[] = [
	"general",
	"members",
	"invite-codes",
	"billing",
];

export default function OrganizationSettingsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const organization = useOrganization();
	const toastShown = useRef(false);

	const myRole = useQuery(api.organizationMembers.myRole, {
		organizationId: organization.organizationId,
	});

	const sectionParam = searchParams.get("section") ?? "general";
	const activeSection: OrgSettingsSectionId = validSections.includes(
		sectionParam as OrgSettingsSectionId,
	)
		? (sectionParam as OrgSettingsSectionId)
		: "general";

	useEffect(() => {
		if (searchParams.get("success") !== "true" || toastShown.current) {
			return;
		}

		toastShown.current = true;
		toast.success("Plan upgraded successfully!");
		const params = new URLSearchParams(searchParams.toString());
		params.delete("success");
		const nextQuery = params.toString();
		window.history.replaceState(
			{},
			"",
			nextQuery
				? `${window.location.pathname}?${nextQuery}`
				: window.location.pathname,
		);
	}, [searchParams]);

	const handleSectionChange = useCallback(
		(section: OrgSettingsSectionId) => {
			const params = new URLSearchParams(searchParams.toString());
			params.set("section", section);
			router.replace(`?${params.toString()}`, { scroll: false });
		},
		[router, searchParams],
	);

	if (myRole === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	const isAdmin = myRole?.role === "admin" || myRole?.role === "owner";

	return (
		<div className="mx-2 my-2 flex min-h-[calc(100vh-1rem)] flex-col rounded-lg border border-border bg-background">
			<header className="flex items-center gap-3 border-b border-border px-4 py-3">
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 rounded-lg text-muted-foreground"
					onClick={() => router.push(`/organizations/${organization.orgSlug}`)}
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div>
					<h1 className="text-base font-medium text-foreground">
						Organization Settings
					</h1>
					<p className="text-xs text-muted-foreground">
						{organization.orgName}
					</p>
				</div>
			</header>

			<OrgSettingsPanel
				className="min-h-0 flex-1"
				activeSection={activeSection}
				onSectionChange={handleSectionChange}
				isAdmin={isAdmin}
			/>
		</div>
	);
}
