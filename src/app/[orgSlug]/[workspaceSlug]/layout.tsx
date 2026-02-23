"use client";

import { useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AIActionMenuDialog } from "@/components/ai/AIActionMenuDialog";
import {
	AIChatPanelProvider,
	useAIChatPanel,
} from "@/components/ai/ai-chat-context";
import {
	InlineAIPrompt,
	InlineAIPromptProvider,
} from "@/components/ai/InlineAIPrompt";
import { AppSidebar } from "@/components/app-sidebar";
import { WhatsNewPopup } from "@/components/changelog/WhatsNewPopup";
import { CommandPalette } from "@/components/command-palette";
import { IssueCreateProvider } from "@/components/issues/IssueCreateContext";
import { IssueCreateModals } from "@/components/issues/IssueCreateModals";
import { PropertyShortcutPicker } from "@/components/issues/PropertyShortcutPicker";
import { PixelLogo } from "@/components/marketing/pixel-logo";
import { useOrganization } from "@/components/providers/organization-context";
import { WorkspaceProvider } from "@/components/providers/workspace-context";
import { WorkspaceDataProvider } from "@/components/providers/workspace-data-context";
import { ShortcutsHelpOverlay } from "@/components/shortcuts-help-overlay";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AIActionMenuProvider } from "@/hooks/use-ai-keyboard-shortcuts";
import { RightPanelProvider, useRightPanel } from "@/hooks/use-right-panel";
import { ShortcutProvider } from "@/hooks/use-shortcuts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const AIChatSidebar = dynamic(
	() => import("@/components/ai/chat-sidebar").then((mod) => mod.AIChatSidebar),
	{ ssr: false },
);

const AIChatTrigger = dynamic(
	() =>
		import("@/components/ai/ai-chat-trigger").then((mod) => mod.AIChatTrigger),
	{ ssr: false },
);

function BrandingWordmark() {
	const { isOpen: aiChatOpen } = useAIChatPanel();
	const { anyOpen: rightPanelOpen } = useRightPanel();
	if (aiChatOpen || rightPanelOpen) return null;
	return (
		<div className="pointer-events-none fixed bottom-4 right-4 z-10 opacity-15 select-none">
			<PixelLogo cellSize={3} gap={1} color="currentColor" />
		</div>
	);
}

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams();
	const router = useRouter();
	const slug = params.workspaceSlug as string;
	const { orgSlug, organizationId } = useOrganization();
	const pathname = usePathname();

	const workspace = useQuery(api.workspaces.getBySlug, { slug });
	const user = useQuery(api.users.current);
	const updateUser = useMutation(api.users.update);
	const setActiveContext = useMutation(api.users.setActiveContext);
	const logoUrl = useQuery(
		api.workspaces.getLogoUrl,
		workspace ? { workspaceId: workspace._id } : "skip",
	);
	const isAuthenticated = user !== undefined && user !== null;
	const workspaceId = workspace?._id;
	const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
	const chatRouteBase = `/${orgSlug}/${slug}/chat`;
	const isChatRoute = pathname
		? pathname === chatRouteBase || pathname.startsWith(`${chatRouteBase}/`)
		: false;

	useEffect(() => {
		if (user === undefined || user === null) return;
		setSidebarOpen(!user.sidebarCollapsed);
	}, [user]);

	const activeContextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (!isAuthenticated || !workspaceId) return;
		if (activeContextTimer.current) clearTimeout(activeContextTimer.current);
		activeContextTimer.current = setTimeout(() => {
			void setActiveContext({
				organizationId,
				workspaceId,
			}).catch(() => {
				// Non-blocking: navigation should not fail if context write fails.
			});
		}, 2000);
		return () => {
			if (activeContextTimer.current) clearTimeout(activeContextTimer.current);
		};
	}, [isAuthenticated, workspaceId, organizationId, setActiveContext]);

	const workspaceContextValue = useMemo(
		() => ({
			workspaceId: workspace?._id ?? ("" as unknown as Id<"workspaces">),
			workspaceSlug: workspace?.slug ?? "",
			workspaceName: workspace?.name ?? "",
			orgSlug,
			logoUrl: logoUrl ?? null,
		}),
		[workspace?._id, workspace?.slug, workspace?.name, orgSlug, logoUrl],
	);

	// Still loading
	if (workspace === undefined || user === undefined) {
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
					<Skeleton className="h-32 w-full" />
				</div>
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
					The workspace &ldquo;{slug}&rdquo; does not exist or you don&apos;t
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
		<WorkspaceProvider value={workspaceContextValue}>
			<WorkspaceDataProvider>
				<ShortcutProvider>
					<IssueCreateProvider>
						<AIChatPanelProvider>
							<InlineAIPromptProvider>
								<AIActionMenuProvider>
									<RightPanelProvider>
										<SidebarProvider
											open={sidebarOpen}
											onOpenChange={(open) => {
												setSidebarOpen(open);
												void updateUser({ sidebarCollapsed: !open });
											}}
										>
											<AppSidebar />
											<SidebarInset>
												<div className="relative flex flex-1 flex-col min-h-0">
													<Suspense
														fallback={
															<div className="flex flex-1 flex-col gap-4 p-6">
																<Skeleton className="h-8 w-48" />
																<Skeleton className="h-px w-full" />
																<Skeleton className="h-64 w-full" />
																<Skeleton className="h-32 w-full" />
															</div>
														}
													>
														{children}
													</Suspense>
													{!isChatRoute ? (
														<>
															<AIChatTrigger />
															<BrandingWordmark />
														</>
													) : null}
												</div>
											</SidebarInset>
											{!isChatRoute ? <AIChatSidebar /> : null}
											<WhatsNewPopup />
										</SidebarProvider>
									</RightPanelProvider>
									<InlineAIPrompt />
									<AIActionMenuDialog />
								</AIActionMenuProvider>
							</InlineAIPromptProvider>
						</AIChatPanelProvider>
						<CommandPalette />
						<IssueCreateModals />
					</IssueCreateProvider>
					<ShortcutsHelpOverlay />
					<PropertyShortcutPicker />
				</ShortcutProvider>
			</WorkspaceDataProvider>
		</WorkspaceProvider>
	);
}
