"use client";

import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { api } from "../../../convex/_generated/api";
import { PaneDescription, PaneTitle } from "./settings-shared";
export function NotificationsSettingsPane() {
	const user = useCurrentUser();
	const updateUser = useMutation(api.users.update);

	const methodItems = [
		{
			id: "in-app" as const,
			title: "In-app",
			description: "Notifications will go into your Inbox",
			field: "notifyInApp" as const,
		},
		{
			id: "email" as const,
			title: "Email",
			description: "You will receive emails about events",
			field: "notifyEmail" as const,
		},
		{
			id: "google-chat" as const,
			title: "Google Chat",
			description: "Relay eligible notifications to your linked Google Chat DM",
			field: "notifyGoogleChat" as const,
		},
	];

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Notifications</PaneTitle>
				<PaneDescription className="mt-1">
					Stay in the loop without the noise. Choose where you get updates, and
					customize which activities trigger notifications.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-4">
				<h3 className="text-sm font-semibold text-foreground">Methods</h3>
				<div className="space-y-3">
					{methodItems.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between rounded-xl border border-border bg-card/80 px-4 py-3"
						>
							<div className="flex flex-col">
								<span className="text-sm text-foreground">{item.title}</span>
								<span className="text-xs text-muted-foreground">
									{item.description}
								</span>
							</div>
							<Switch
								checked={user?.[item.field] ?? true}
								onCheckedChange={async (checked) => {
									try {
										await updateUser({ [item.field]: checked });
										toast.success(
											`${item.title} notifications ${checked ? "enabled" : "disabled"}`,
										);
									} catch {
										toast.error(
											`Failed to update ${item.title.toLowerCase()} notifications`,
										);
									}
								}}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
