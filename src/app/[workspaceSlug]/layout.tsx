"use client";

import { useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AIChatPanelProvider } from "@/components/ai/ai-chat-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PixelLogo } from "@/components/marketing/pixel-logo";
import { CommandPalette } from "@/components/command-palette";
import { IssueCreateProvider } from "@/components/issues/IssueCreateContext";
import { IssueCreateModals } from "@/components/issues/IssueCreateModals";
import { PropertyShortcutPicker } from "@/components/issues/PropertyShortcutPicker";
import { ShortcutsHelpOverlay } from "@/components/shortcuts-help-overlay";
import { ShortcutProvider } from "@/hooks/use-shortcuts";

const AIChatSidebar = dynamic(
	() => import("@/components/ai/chat-sidebar").then((mod) => mod.AIChatSidebar),
	{ ssr: false },
);

const AIChatTrigger = dynamic(
	() =>
		import("@/components/ai/ai-chat-trigger").then((mod) => mod.AIChatTrigger),
	{ ssr: false },
);

import { WorkspaceProvider } from "@/components/providers/workspace-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { api } from "../../../convex/_generated/api";

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams();
	const router = useRouter();
	const slug = params.workspaceSlug as string;

	const workspace = useQuery(api.workspaces.getBySlug, { slug });
	const user = useQuery(api.users.current);
	const logoUrl = useQuery(
		api.workspaces.getLogoUrl,
		workspace ? { workspaceId: workspace._id } : "skip",
	);

	// Still loading
	if (workspace === undefined || user === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	// Not authenticated
	if (user === null) {
		router.replace("/sign-in");
		return null;
	}

	// Workspace not found
	if (workspace === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4">
				<h1 className="text-2xl font-semibold">Workspace not found</h1>
				<p className="text-muted-foreground">
					The workspace "{slug}" does not exist or you don't have access.
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
		<WorkspaceProvider
			value={{
				workspaceId: workspace._id,
				workspaceSlug: workspace.slug,
				workspaceName: workspace.name,
				logoUrl: logoUrl ?? null,
			}}
		>
			<ShortcutProvider>
				<IssueCreateProvider>
					<AIChatPanelProvider>
						<SidebarProvider>
							<AppSidebar />
							<SidebarInset>
								<div className="relative flex-1">
									<Suspense fallback={null}>{children}</Suspense>
									<AIChatTrigger />
									{/* Wordmark */}
									<div className="pointer-events-none fixed bottom-4 right-4 z-10 opacity-15 select-none">
										<PixelLogo
											cellSize={3}
											gap={1}
											color="currentColor"
										/>
									</div>
								</div>
							</SidebarInset>
							<AIChatSidebar />
						</SidebarProvider>
					</AIChatPanelProvider>
					<CommandPalette />
					<IssueCreateModals />
				</IssueCreateProvider>
				<ShortcutsHelpOverlay />
				<PropertyShortcutPicker />
			</ShortcutProvider>
		</WorkspaceProvider>
	);
}
