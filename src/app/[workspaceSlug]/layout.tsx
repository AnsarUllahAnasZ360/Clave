"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
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
import { DemoWorkspacePopup } from "@/components/demo/DemoWorkspacePopup";
import { IssueCreateProvider } from "@/components/issues/IssueCreateContext";
import { IssueCreateModals } from "@/components/issues/IssueCreateModals";
import { PropertyShortcutPicker } from "@/components/issues/PropertyShortcutPicker";
import { PixelLogo } from "@/components/marketing/pixel-logo";
import { GlobalDictationProvider } from "@/components/providers/global-dictation-provider";
import { WorkspaceProvider } from "@/components/providers/workspace-context";
import { WorkspaceDataProvider } from "@/components/providers/workspace-data-context";
import { ShortcutsHelpOverlay } from "@/components/shortcuts-help-overlay";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AIActionMenuProvider } from "@/hooks/use-ai-keyboard-shortcuts";
import { RightPanelProvider, useRightPanel } from "@/hooks/use-right-panel";
import { ShortcutProvider } from "@/hooks/use-shortcuts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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
	const chatRouteBase = `/${slug}/chat`;
	const isChatRoute = pathname
		? pathname === chatRouteBase || pathname.startsWith(`${chatRouteBase}/`)
		: false;

	useEffect(() => {
		if (user === undefined || user === null) return;
		setSidebarOpen(!user.sidebarCollapsed);
	}, [user]);

	const activeContextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unauthRedirectedRef = useRef(false);
	useEffect(() => {
		if (!isAuthenticated || !workspaceId) return;
		if (activeContextTimer.current) clearTimeout(activeContextTimer.current);
		activeContextTimer.current = setTimeout(() => {
			void setActiveContext({
				workspaceId,
			}).catch(() => {
				// Non-blocking: navigation should not fail if context write fails.
			});
		}, 2000);
		return () => {
			if (activeContextTimer.current) clearTimeout(activeContextTimer.current);
		};
	}, [isAuthenticated, workspaceId, setActiveContext]);

	const onboardingRedirectedRef = useRef(false);

	useEffect(() => {
		if (user !== null) {
			unauthRedirectedRef.current = false;
			return;
		}
		if (unauthRedirectedRef.current) return;
		unauthRedirectedRef.current = true;
		router.replace("/sign-in");
	}, [user, router]);

	// Onboarding guard: redirect users who haven't joined any workspace yet
	useEffect(() => {
		if (user === undefined || user === null) return;
		if (workspace === undefined) return;
		if (workspace !== null) {
			onboardingRedirectedRef.current = false;
			return;
		}
		if (!user.lastActiveWorkspaceId) {
			if (onboardingRedirectedRef.current) return;
			onboardingRedirectedRef.current = true;
			router.replace("/onboarding");
		}
	}, [user, workspace, router]);

	const workspaceContextValue = useMemo(
		() => ({
			workspaceId: workspace?._id ?? ("" as unknown as Id<"workspaces">),
			workspaceSlug: workspace?.slug ?? "",
			workspaceName: workspace?.name ?? "",
			logoUrl: logoUrl ?? null,
			isDemo: workspace?.isDemo ?? false,
		}),
		[
			workspace?._id,
			workspace?.slug,
			workspace?.name,
			logoUrl,
			workspace?.isDemo,
		],
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
		return null;
	}

	// Workspace not found OR user is not a member. Render a recovery panel
	// inline rather than calling notFound(): notFound() inside a layout
	// escapes to the parent segment's not-found.tsx, which would lose the
	// workspace-aware recovery affordances (switcher, sign-out).
	if (workspace === null) {
		return <WorkspaceNotAccessible slug={slug} />;
	}

	return (
		<WorkspaceProvider value={workspaceContextValue}>
			<WorkspaceDataProvider>
				<GlobalDictationProvider>
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
												<DemoWorkspacePopup />
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
				</GlobalDictationProvider>
			</WorkspaceDataProvider>
		</WorkspaceProvider>
	);
}

function WorkspaceNotAccessible({ slug }: { slug: string }) {
	const router = useRouter();
	const { signOut } = useAuthActions();
	const myWorkspaces = useQuery(api.workspaces.list);

	const handleSignOut = async () => {
		await signOut();
		router.replace("/sign-in");
	};

	const accessible = myWorkspaces ?? [];

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-12 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="font-mono text-xs uppercase tracking-[0.18em] text-sienna-500">
					404
				</p>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Workspace not found
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					&ldquo;{slug}&rdquo; doesn&apos;t exist or you don&apos;t have access
					with this account.
				</p>
			</div>

			{myWorkspaces === undefined ? (
				<div className="h-px w-full max-w-sm" />
			) : accessible.length > 0 ? (
				<div className="flex w-full max-w-sm flex-col gap-2">
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Your workspaces
					</p>
					<ul className="flex flex-col gap-1">
						{accessible.map((ws) => (
							<li key={ws._id}>
								<Link
									href={`/${ws.slug}/chat` as Route}
									className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-sienna-500/50 hover:bg-accent"
								>
									<span className="font-medium text-foreground">{ws.name}</span>
									<span className="font-mono text-xs text-muted-foreground">
										/{ws.slug}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</div>
			) : null}

			<div className="flex items-center gap-2">
				<Button asChild variant="default" size="sm">
					<Link href={"/" as Route}>Go home</Link>
				</Button>
				<Button onClick={handleSignOut} variant="outline" size="sm">
					Sign out
				</Button>
			</div>
		</div>
	);
}
