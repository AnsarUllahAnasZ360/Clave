"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { api } from "../../../convex/_generated/api";

const DEV_SUPERADMIN_EMAILS = new Set([
	"kul@goclave.app",
	"cool@gocliff.app",
	"pull@gocliff.app",
]);

export default function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const user = useQuery(api.users.current);
	const ensureDevMember = useMutation(api.devInit.ensureDevWorkspaceMember);
	const [isBootstrappingDev, setIsBootstrappingDev] = useState(false);
	const attemptedBootstrap = useRef(false);

	useEffect(() => {
		if (user === null) {
			router.replace("/sign-in");
			return;
		}

		if (user === undefined || user.role === "superadmin") {
			return;
		}

		const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";
		const email = user.email?.toLowerCase();
		const canAutoPromote = email ? DEV_SUPERADMIN_EMAILS.has(email) : false;

		if (isDevMode && canAutoPromote && !attemptedBootstrap.current) {
			attemptedBootstrap.current = true;
			setIsBootstrappingDev(true);
			void ensureDevMember()
				.catch(() => {
					// Ignore and fall through to redirect on next render if still unauthorized.
				})
				.finally(() => {
					setIsBootstrappingDev(false);
				});
			return;
		}

		if (!isBootstrappingDev) {
			router.replace("/");
		}
	}, [user, router, ensureDevMember, isBootstrappingDev]);

	// Loading state
	if (user === undefined || isBootstrappingDev) {
		return (
			<div className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(2,6,23,0.08),transparent_45%)]">
				<div className="text-muted-foreground">Authorizing admin access...</div>
			</div>
		);
	}

	// Not authorized
	if (user === null || user.role !== "superadmin") {
		return null;
	}

	return (
		<SidebarProvider>
			<AdminSidebar />
			<SidebarInset className="bg-[radial-gradient(circle_at_top_left,rgba(2,6,23,0.08),transparent_45%)]">
				<AdminHeader />
				<main className="flex-1 overflow-auto">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
