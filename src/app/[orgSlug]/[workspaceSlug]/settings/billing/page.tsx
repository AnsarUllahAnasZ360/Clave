"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { BillingSettingsPage } from "@/components/billing/BillingSettingsPage";
import { useOrganization } from "@/components/providers/organization-context";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "../../../../../../convex/_generated/api";

export default function BillingPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const org = useOrganization();

	const myRole = useQuery(api.organizationMembers.myRole, {
		organizationId: org.organizationId,
	});

	const isAdmin = myRole?.role === "admin" || myRole?.role === "owner";

	// Handle ?success=true from Stripe checkout redirect
	const toastShown = useRef(false);
	useEffect(() => {
		if (searchParams.get("success") === "true" && !toastShown.current) {
			toastShown.current = true;
			toast.success("Plan upgraded successfully!");
			// Clean up the query param without triggering navigation
			window.history.replaceState({}, "", window.location.pathname);
		}
	}, [searchParams]);

	// Loading state for role check
	if (myRole === undefined) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<header className="flex items-center gap-3 border-b border-border px-4 py-3">
				<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 rounded-lg text-muted-foreground"
					onClick={() => router.back()}
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<h1 className="text-base font-medium text-foreground">Billing</h1>
			</header>

			<main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
				<div className="mx-auto max-w-4xl">
					<BillingSettingsPage isAdmin={isAdmin} />
				</div>
			</main>
		</div>
	);
}
