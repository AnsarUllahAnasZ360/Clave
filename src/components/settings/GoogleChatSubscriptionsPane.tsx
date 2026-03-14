"use client";

import { Trash } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Id } from "../../../convex/_generated/dataModel";
import { SettingSection } from "./settings-shared";

const listSpaceSubscriptionsRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	Array<{
		_id: Id<"chatSubscriptions">;
		targetId: string;
		eventType: string;
		enabled: boolean;
	}>
>("chatRelay:listSpaceSubscriptions");

const setSpaceSubscriptionRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		targetId: string;
		eventType: string;
		enabled: boolean;
	},
	Id<"chatSubscriptions">
>("chatRelay:setSpaceSubscription");

const removeSpaceSubscriptionsForTargetRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		targetId: string;
	},
	number
>("chatRelay:removeSpaceSubscriptionsForTarget");

const relayEventOptions = [
	{ id: "issue_assigned", label: "Issue assigned" },
	{ id: "issue_status_changed", label: "Issue status changed" },
	{ id: "issue_mentioned", label: "Issue mentioned" },
	{ id: "comment", label: "Comment" },
	{ id: "project_update", label: "Project update" },
	{ id: "document_comment", label: "Document comment" },
] as const;

export function GoogleChatSubscriptionsPane() {
	const workspace = useWorkspaceOptional();
	const members = useWorkspaceMembers();
	const currentUser = useCurrentUser();
	const currentMember = members?.find(
		(member) => member.userId === currentUser?._id,
	);
	const isAdmin = currentMember?.role === "admin";

	const subscriptions = useQuery(
		listSpaceSubscriptionsRef,
		workspace
			? {
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
				}
			: "skip",
	);
	const setSpaceSubscription = useMutation(setSpaceSubscriptionRef);
	const removeSpaceSubscriptionsForTarget = useMutation(
		removeSpaceSubscriptionsForTargetRef,
	);

	const [newSpaceTarget, setNewSpaceTarget] = useState("");
	const groupedTargets = useMemo(() => {
		const targetMap = new Map<string, Map<string, boolean>>();
		for (const subscription of subscriptions ?? []) {
			if (!targetMap.has(subscription.targetId)) {
				targetMap.set(subscription.targetId, new Map());
			}
			targetMap
				.get(subscription.targetId)
				?.set(subscription.eventType, subscription.enabled);
		}
		return [...targetMap.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [subscriptions]);

	if (!workspace || !isAdmin) {
		return null;
	}

	const handleCreateTarget = async () => {
		const trimmed = newSpaceTarget.trim();
		if (!trimmed) return;

		const targetId = trimmed.startsWith("spaces/")
			? trimmed
			: `spaces/${trimmed}`;
		try {
			for (const eventOption of relayEventOptions) {
				await setSpaceSubscription({
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
					targetId,
					eventType: eventOption.id,
					enabled: false,
				});
			}
			setNewSpaceTarget("");
			toast.success("Space subscription target added");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to add space subscription target",
			);
		}
	};

	const handleToggle = async (
		targetId: string,
		eventType: string,
		enabled: boolean,
	) => {
		try {
			await setSpaceSubscription({
				workspaceId: workspace.workspaceId,
				provider: "google-chat",
				targetId,
				eventType,
				enabled,
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update Google Chat subscription",
			);
		}
	};

	const handleRemoveTarget = async (targetId: string) => {
		try {
			await removeSpaceSubscriptionsForTarget({
				workspaceId: workspace.workspaceId,
				provider: "google-chat",
				targetId,
			});
			toast.success("Space subscription target removed");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to remove space subscription target",
			);
		}
	};

	return (
		<SettingSection title="Space subscriptions">
			<div className="space-y-2">
				<p className="text-xs text-muted-foreground">
					Choose which workspace events are forwarded to each Google Chat space.
					Find the space name in Google Chat under space details (e.g.
					spaces/AAAA1234).
				</p>
				<div className="flex gap-2">
					<Input
						placeholder="spaces/AAAA1234"
						value={newSpaceTarget}
						onChange={(event) => setNewSpaceTarget(event.target.value)}
					/>
					<Button variant="outline" onClick={() => void handleCreateTarget()}>
						Add space
					</Button>
				</div>
			</div>

			{groupedTargets.length === 0 ? (
				<p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					No space subscriptions configured yet.
				</p>
			) : (
				<div className="space-y-3">
					{groupedTargets.map(([targetId, eventMap]) => (
						<div
							key={targetId}
							className="space-y-3 rounded-lg border border-border bg-card/70 px-3 py-3"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="font-mono text-xs text-foreground">{targetId}</p>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => void handleRemoveTarget(targetId)}
									aria-label={`Remove ${targetId}`}
								>
									<Trash className="h-4 w-4" />
								</Button>
							</div>
							<div className="space-y-2">
								{relayEventOptions.map((eventOption) => (
									<div
										key={`${targetId}-${eventOption.id}`}
										className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-3 py-2"
									>
										<span className="text-sm text-foreground">
											{eventOption.label}
										</span>
										<Switch
											checked={eventMap.get(eventOption.id) ?? false}
											onCheckedChange={(checked) =>
												void handleToggle(targetId, eventOption.id, checked)
											}
										/>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</SettingSection>
	);
}
