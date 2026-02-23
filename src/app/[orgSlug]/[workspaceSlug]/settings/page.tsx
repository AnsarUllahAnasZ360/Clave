"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
	AccountSettingsPane,
	ClaveAISettingsPane,
	IdentitySettingsPane,
	McpServersSettingsPane,
	NotificationsSettingsPane,
	PlaceholderSettingsPane,
	type SettingsItemId,
	SkillsSettingsPane,
	SlashCommandsSettingsPane,
	SubAgentsSettingsPane,
	settingsItemIcons,
	settingsSections,
	TeammatesSettingsPane,
	TypesSettingsPane,
} from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { cn } from "@/lib/utils";

const paneComponents: Record<SettingsItemId, React.ComponentType> = {
	account: AccountSettingsPane,
	notifications: NotificationsSettingsPane,
	teammates: TeammatesSettingsPane,
	identity: IdentitySettingsPane,
	types: TypesSettingsPane,
	"clave-ai": ClaveAISettingsPane,
	"slash-commands": SlashCommandsSettingsPane,
	agents: SubAgentsSettingsPane,
	skills: SkillsSettingsPane,
	"mcp-servers": McpServersSettingsPane,
};

export default function SettingsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { isAdmin } = useWorkspaceRole();

	const visibleSections = isAdmin
		? settingsSections
		: settingsSections.filter((s) => s.id === "personal");

	const visibleItemIds = new Set<string>(
		visibleSections.flatMap((s) => s.items.map((i) => i.id)),
	);

	const sectionParam = searchParams.get("section") ?? "account";
	const activeItemId: SettingsItemId = visibleItemIds.has(sectionParam)
		? (sectionParam as SettingsItemId)
		: "account";

	const handleSectionChange = useCallback(
		(id: SettingsItemId) => {
			const params = new URLSearchParams(searchParams.toString());
			params.set("section", id);
			router.replace(`?${params.toString()}`, { scroll: false });
		},
		[router, searchParams],
	);

	const ActivePane = paneComponents[activeItemId] ?? PlaceholderSettingsPane;

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
				<h1 className="text-base font-medium text-foreground">Settings</h1>
			</header>

			<div className="flex flex-1 min-h-0">
				<aside className="w-64 shrink-0 border-r border-border/60 bg-muted/40 px-4 py-4 overflow-y-auto">
					<div className="space-y-4 text-sm">
						{visibleSections.map((section) => (
							<div key={section.id} className="space-y-1.5">
								<div className="text-sm font-semibold text-muted-foreground">
									{section.label}
								</div>
								<div className="flex flex-col gap-0.5">
									{section.items.map((item) => {
										const isActive = item.id === activeItemId;
										const Icon = settingsItemIcons[item.id];
										return (
											<button
												key={item.id}
												type="button"
												onClick={() => handleSectionChange(item.id)}
												className={cn(
													"flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-left text-[15px] text-muted-foreground hover:bg-accent hover:text-foreground",
													isActive && "bg-accent text-foreground",
												)}
											>
												<span className="flex items-center gap-2">
													{Icon && <Icon className="h-4 w-4" />}
													{item.label}
												</span>
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</aside>

				<main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
					<ActivePane />
				</main>
			</div>
		</div>
	);
}
