"use client";

import {
	ArrowSquareOut,
	Check,
	CircleNotch,
	CreditCard,
	Crown,
	Lightning,
} from "@phosphor-icons/react/dist/ssr";
import { useAction, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { UsageIndicator } from "./UsageIndicator";

// ── Feature label map ──────────────────────────────────────────────────────

const featureLabels: Record<string, string> = {
	basic_projects: "Projects",
	basic_documents: "Documents",
	basic_whiteboards: "Whiteboards",
	advanced_analytics: "Advanced analytics",
	priority_support: "Priority support",
	custom_fields: "Custom fields",
	api_access: "API access",
	sso: "Single sign-on (SSO)",
	audit_log: "Audit log",
	dedicated_support: "Dedicated support",
	custom_integrations: "Custom integrations",
};

// ── Plan pricing (display only — actual pricing is in Stripe) ──────────────

const planPricing: Record<string, string> = {
	free: "$0",
	pro: "$12",
	enterprise: "Custom",
};

const planPricingSuffix: Record<string, string> = {
	free: "forever",
	pro: "/member/mo",
	enterprise: "pricing",
};

// ── Status badge styling ───────────────────────────────────────────────────

const statusColors: Record<string, string> = {
	active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	trialing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	past_due: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	canceled: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
	active: "Active",
	trialing: "Trial",
	past_due: "Past due",
	canceled: "Canceled",
};

const planBadgeColors: Record<string, string> = {
	free: "bg-muted text-muted-foreground",
	pro: "bg-primary/10 text-primary",
	enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

// ── Main Component ─────────────────────────────────────────────────────────

export function BillingSettingsPage({ isAdmin }: { isAdmin: boolean }) {
	const workspace = useWorkspaceOptional();

	const subscription = useQuery(
		api.billing.getSubscription,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const plans = useQuery(api.billing.getPlans);
	const usageSummary = useQuery(
		api.billing.getUsageSummary,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);

	const createCheckout = useAction(api.billing.createCheckoutSession);
	const createPortal = useAction(api.billing.createPortalSession);

	const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
	const [portalLoading, setPortalLoading] = useState(false);

	const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
	const billingPath = workspace
		? `/${workspace.workspaceSlug}/settings/billing`
		: "/settings/billing";

	const buildBillingUrl = useCallback(
		(includeSuccess: boolean) => {
			const url = new URL(billingPath, baseUrl);
			if (includeSuccess) {
				url.searchParams.set("success", "true");
			} else {
				url.searchParams.delete("success");
			}
			return url.toString();
		},
		[baseUrl, billingPath],
	);

	const handleUpgrade = useCallback(
		async (priceId: string, planKey: string) => {
			if (!isAdmin) {
				toast.error("Only workspace admins can manage billing");
				return;
			}
			setCheckoutLoading(planKey);
			try {
				const result = await createCheckout({
					workspaceId: workspace?.workspaceId ?? ("" as never),
					priceId,
					successUrl: buildBillingUrl(true),
					cancelUrl: buildBillingUrl(false),
				});
				if (result.url) {
					window.location.href = result.url;
				} else {
					toast.error(
						"Billing is not configured. Contact support to upgrade your plan.",
					);
				}
			} catch {
				toast.error("Failed to start checkout. Please try again.");
			} finally {
				setCheckoutLoading(null);
			}
		},
		[createCheckout, workspace?.workspaceId, isAdmin, buildBillingUrl],
	);

	const handleManageBilling = useCallback(async () => {
		if (!isAdmin) {
			toast.error("Only workspace admins can manage billing");
			return;
		}
		setPortalLoading(true);
		try {
			const result = await createPortal({
				workspaceId: workspace?.workspaceId ?? ("" as never),
				returnUrl: buildBillingUrl(false),
			});
			if (result.url) {
				window.location.href = result.url;
			} else {
				toast.error(
					"Billing is not configured. Contact support to manage your subscription.",
				);
			}
		} catch {
			toast.error("Failed to open billing portal. Please try again.");
		} finally {
			setPortalLoading(false);
		}
	}, [createPortal, workspace?.workspaceId, buildBillingUrl, isAdmin]);

	// Loading state
	if (
		subscription === undefined ||
		plans === undefined ||
		usageSummary === undefined
	) {
		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-xl font-semibold">Billing</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Loading billing information...
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-64 animate-pulse rounded-xl border border-border bg-muted/30"
						/>
					))}
				</div>
			</div>
		);
	}

	// Check if Stripe is configured (plans have stripePriceId)
	const hasStripeConfigured = plans.some(
		(p: (typeof plans)[number]) => p.stripePriceId,
	);
	const currentPlan = subscription?.plan ?? "free";
	const subscriptionStatus = subscription?.subscriptionStatus;
	const hasSubscription = !!subscription?.subscriptionId;

	return (
		<div className="space-y-8">
			{/* Header */}
			<div>
				<h2 className="text-xl font-semibold">Billing</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage your workspace plan and billing.
				</p>
			</div>

			{/* Current Plan Banner */}
			<Card>
				<CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-5">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium text-muted-foreground">
								Current plan
							</span>
							<Badge
								variant="secondary"
								className={cn("text-xs px-2", planBadgeColors[currentPlan])}
							>
								{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
							</Badge>
							{subscriptionStatus && (
								<Badge
									variant="secondary"
									className={cn(
										"text-xs px-2",
										statusColors[subscriptionStatus] ??
											"bg-muted text-muted-foreground",
									)}
								>
									{statusLabels[subscriptionStatus] ?? subscriptionStatus}
								</Badge>
							)}
						</div>
					</div>
					{isAdmin && hasSubscription && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleManageBilling}
							disabled={portalLoading}
						>
							{portalLoading ? (
								<>
									<CircleNotch className="mr-1.5 h-3.5 w-3.5 animate-spin" />
									Loading...
								</>
							) : (
								<>
									<CreditCard className="mr-1.5 h-3.5 w-3.5" />
									Manage Billing
									<ArrowSquareOut className="ml-1 h-3 w-3" />
								</>
							)}
						</Button>
					)}
				</CardContent>
			</Card>

			{/* Usage Summary */}
			{usageSummary && (
				<div className="space-y-3">
					<h3 className="text-sm font-semibold text-foreground">Usage</h3>
					<div className="grid gap-4 sm:grid-cols-2">
						<Card>
							<CardContent className="py-4">
								<UsageIndicator
									current={usageSummary.members.current}
									max={usageSummary.members.max}
									label="Members"
								/>
							</CardContent>
						</Card>
					</div>
				</div>
			)}

			{/* Plan Comparison Grid */}
			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-foreground">Plans</h3>

				{!hasStripeConfigured && (
					<Card className="border-dashed">
						<CardContent className="py-6 text-center">
							<p className="text-sm text-muted-foreground">
								Billing is not configured. Contact support to upgrade your plan.
							</p>
						</CardContent>
					</Card>
				)}

				<div className="grid gap-4 sm:grid-cols-3">
					{plans.map((plan: (typeof plans)[number]) => {
						const isCurrent = plan.key === currentPlan;
						const isEnterprise = plan.key === "enterprise";
						const stripePriceId = plan.stripePriceId ?? null;
						const canUpgrade =
							isAdmin &&
							!isCurrent &&
							hasStripeConfigured &&
							!!stripePriceId &&
							!isEnterprise;

						return (
							<Card
								key={plan._id}
								className={cn(
									"relative flex flex-col",
									isCurrent && "border-primary/50 ring-1 ring-primary/20",
								)}
							>
								{isCurrent && (
									<div className="absolute -top-2.5 left-4">
										<Badge variant="default" className="text-[10px] px-2 py-0">
											Current plan
										</Badge>
									</div>
								)}
								<CardHeader className="pb-3">
									<div className="flex items-center gap-2">
										{plan.key === "pro" && (
											<Lightning
												weight="fill"
												className="h-4 w-4 text-primary"
											/>
										)}
										{plan.key === "enterprise" && (
											<Crown weight="fill" className="h-4 w-4 text-amber-500" />
										)}
										<CardTitle className="text-base">{plan.name}</CardTitle>
									</div>
									{plan.description && (
										<CardDescription className="text-xs">
											{plan.description}
										</CardDescription>
									)}
								</CardHeader>

								<CardContent className="flex-1 space-y-4">
									{/* Pricing */}
									<div className="flex items-baseline gap-1">
										<span className="text-2xl font-bold">
											{planPricing[plan.key] ?? "$0"}
										</span>
										<span className="text-xs text-muted-foreground">
											{planPricingSuffix[plan.key] ?? ""}
										</span>
									</div>

									{/* Limits */}
									<div className="space-y-1 text-xs text-muted-foreground">
										<div>
											{plan.limits.maxMembers >= 999999
												? "Unlimited"
												: plan.limits.maxMembers}{" "}
											members
										</div>
									</div>

									{/* Features */}
									<div className="space-y-1.5">
										{plan.features.map((f: string) => (
											<div key={f} className="flex items-center gap-2 text-xs">
												<Check
													weight="bold"
													className="h-3 w-3 shrink-0 text-emerald-500"
												/>
												<span className="text-muted-foreground">
													{featureLabels[f] ?? f}
												</span>
											</div>
										))}
									</div>
								</CardContent>

								<CardFooter>
									{isCurrent ? (
										<Button
											variant="outline"
											size="sm"
											className="w-full"
											disabled
										>
											Current plan
										</Button>
									) : isEnterprise ? (
										<Button
											variant="outline"
											size="sm"
											className="w-full"
											asChild
										>
											<a href="mailto:support@millhouse.app">Contact Sales</a>
										</Button>
									) : canUpgrade && stripePriceId ? (
										<Button
											size="sm"
											className="w-full"
											disabled={checkoutLoading === plan.key}
											onClick={() => handleUpgrade(stripePriceId, plan.key)}
										>
											{checkoutLoading === plan.key ? (
												<>
													<CircleNotch className="mr-1.5 h-3.5 w-3.5 animate-spin" />
													Redirecting...
												</>
											) : (
												<>Upgrade to {plan.name}</>
											)}
										</Button>
									) : (
										<Button
											variant="outline"
											size="sm"
											className="w-full"
											disabled
										>
											{!isAdmin ? "Admin required" : "Upgrade"}
										</Button>
									)}
								</CardFooter>
							</Card>
						);
					})}
				</div>
			</div>
		</div>
	);
}
