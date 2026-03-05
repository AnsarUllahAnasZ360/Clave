"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { UsageIndicator } from "./UsageIndicator";

export interface PlanLimitInfo {
	kind: "plan_limit";
	limit: "maxMembers" | "maxWorkspaces";
	current: number;
	max: number;
	plan: string;
}

const limitLabels: Record<string, string> = {
	maxMembers: "members",
	maxWorkspaces: "workspaces",
};

const planColors: Record<string, string> = {
	free: "bg-muted text-muted-foreground",
	pro: "bg-primary/10 text-primary",
	enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function PlanLimitDialog({
	open,
	onClose,
	limitInfo,
}: {
	open: boolean;
	onClose: () => void;
	limitInfo: PlanLimitInfo | null;
}) {
	const router = useRouter();
	const workspace = useWorkspaceOptional();
	const plans = useQuery(api.billing.getPlans);

	if (!limitInfo) return null;

	const limitLabel = limitLabels[limitInfo.limit] ?? limitInfo.limit;
	const currentPlanName =
		limitInfo.plan.charAt(0).toUpperCase() + limitInfo.plan.slice(1);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Plan limit reached</DialogTitle>
					<DialogDescription>
						You&apos;ve reached your {limitInfo.max}-{limitLabel} limit on the{" "}
						<span className="font-medium text-foreground">
							{currentPlanName}
						</span>{" "}
						plan.
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					<UsageIndicator
						current={limitInfo.current}
						max={limitInfo.max}
						label={limitLabel.charAt(0).toUpperCase() + limitLabel.slice(1)}
					/>

					{plans && plans.length > 0 && (
						<div className="space-y-2">
							<p className="text-sm font-medium text-foreground">
								Compare plans
							</p>
							<div className="grid gap-2">
								{plans.map((plan) => (
									<div
										key={plan._id}
										className={cn(
											"flex items-center justify-between rounded-lg border px-3 py-2",
											plan.key === limitInfo.plan
												? "border-border bg-muted/50"
												: "border-border",
										)}
									>
										<div className="flex items-center gap-2">
											<Badge
												variant="secondary"
												className={cn(
													"text-[10px] px-1.5",
													planColors[plan.key],
												)}
											>
												{plan.name}
											</Badge>
											{plan.key === limitInfo.plan && (
												<span className="text-xs text-muted-foreground">
													Current
												</span>
											)}
										</div>
										<span className="text-sm tabular-nums text-muted-foreground">
											{limitInfo.limit === "maxMembers"
												? `${plan.limits.maxMembers === 999999 ? "Unlimited" : plan.limits.maxMembers} members`
												: `${plan.limits.maxWorkspaces === 999999 ? "Unlimited" : plan.limits.maxWorkspaces} workspaces`}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button variant="outline" onClick={onClose}>
						Dismiss
					</Button>
					<Button
						onClick={() => {
							onClose();
							if (workspace) {
								router.push(`/${workspace.workspaceSlug}/settings/billing`);
							}
						}}
					>
						Upgrade to Pro
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
