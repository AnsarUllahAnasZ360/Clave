import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	query,
} from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";
import { getCurrentUsage } from "./lib/planLimits";

// ── Public Queries ───────────────────────────────────────────────────────────

/** List all active plans, ordered free → pro → enterprise */
export const getPlans = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("plans"),
			_creationTime: v.number(),
			key: v.union(
				v.literal("free"),
				v.literal("pro"),
				v.literal("enterprise"),
			),
			name: v.string(),
			description: v.optional(v.string()),
			stripePriceId: v.optional(v.string()),
			stripePriceIdYearly: v.optional(v.string()),
			limits: v.object({
				maxMembers: v.number(),
				maxStorageGb: v.number(),
				maxAiMessages: v.number(),
			}),
			features: v.array(v.string()),
			isActive: v.optional(v.boolean()),
		}),
	),
	handler: async (ctx) => {
		const plans = await ctx.db.query("plans").collect();
		// Filter to active plans only (isActive defaults to true when undefined)
		const activePlans = plans.filter((p) => p.isActive !== false);
		// Sort: free → pro → enterprise
		const order: Record<string, number> = {
			free: 0,
			pro: 1,
			enterprise: 2,
		};
		activePlans.sort((a, b) => (order[a.key] ?? 99) - (order[b.key] ?? 99));
		return activePlans;
	},
});

/** Get subscription details for a workspace (requires workspace membership) */
export const getSubscription = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.union(
		v.object({
			plan: v.union(
				v.literal("free"),
				v.literal("pro"),
				v.literal("enterprise"),
			),
			planDetails: v.union(
				v.object({
					_id: v.id("plans"),
					_creationTime: v.number(),
					key: v.union(
						v.literal("free"),
						v.literal("pro"),
						v.literal("enterprise"),
					),
					name: v.string(),
					description: v.optional(v.string()),
					stripePriceId: v.optional(v.string()),
					stripePriceIdYearly: v.optional(v.string()),
					limits: v.object({
						maxMembers: v.number(),
						maxStorageGb: v.number(),
						maxAiMessages: v.number(),
					}),
					features: v.array(v.string()),
					isActive: v.optional(v.boolean()),
				}),
				v.null(),
			),
			stripeCustomerId: v.union(v.string(), v.null()),
			subscriptionId: v.union(v.string(), v.null()),
			subscriptionStatus: v.union(v.string(), v.null()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) return null;

		const planKey = workspace.plan ?? "free";

		// Look up plan details from plans table
		const planDetails = await ctx.db
			.query("plans")
			.withIndex("by_key", (q) => q.eq("key", planKey))
			.unique();

		return {
			plan: planKey,
			planDetails: planDetails ?? null,
			stripeCustomerId: workspace.stripeCustomerId ?? null,
			subscriptionId: workspace.subscriptionId ?? null,
			subscriptionStatus: workspace.subscriptionStatus ?? null,
		};
	},
});

/** Get usage summary for a workspace's billing page (requires workspace membership) */
export const getUsageSummary = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.union(
		v.object({
			members: v.object({ current: v.number(), max: v.number() }),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) return null;

		const usage = await getCurrentUsage(ctx, args.workspaceId);
		const planKey = workspace.plan ?? "free";

		// Determine limits: workspace override > plans table > free defaults
		let maxMembers = 5;

		const planRecord = await ctx.db
			.query("plans")
			.withIndex("by_key", (q) => q.eq("key", planKey))
			.unique();

		if (planRecord) {
			maxMembers = planRecord.limits.maxMembers;
		}

		// Per-workspace overrides
		if (workspace.planLimits?.maxMembers !== undefined) {
			maxMembers = workspace.planLimits.maxMembers;
		}

		return {
			members: { current: usage.members, max: maxMembers },
		};
	},
});

// ── Checkout & Portal Actions ─────────────────────────────────────────────

/** Internal query to verify workspace admin and get billing info (called from actions) */
export const getWorkspaceForCheckout = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.union(
		v.object({
			workspaceName: v.string(),
			billingEmail: v.union(v.string(), v.null()),
			stripeCustomerId: v.union(v.string(), v.null()),
			plan: v.union(
				v.literal("free"),
				v.literal("pro"),
				v.literal("enterprise"),
			),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) return null;
		return {
			workspaceName: workspace.name,
			billingEmail: workspace.billingEmail ?? null,
			stripeCustomerId: workspace.stripeCustomerId ?? null,
			plan: workspace.plan ?? "free",
		};
	},
});

/** Create Stripe checkout session for plan upgrade. Returns { url: null } if Stripe not configured. */
export const createCheckoutSession = action({
	args: {
		workspaceId: v.id("workspaces"),
		priceId: v.string(),
		successUrl: v.string(),
		cancelUrl: v.string(),
	},
	returns: v.object({ url: v.union(v.string(), v.null()) }),
	handler: async (ctx, args): Promise<{ url: string | null }> => {
		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			return { url: null };
		}

		const wsInfo = await ctx.runQuery(
			internal.billing.getWorkspaceForCheckout,
			{
				workspaceId: args.workspaceId,
			},
		);
		if (!wsInfo) {
			throw new Error("Workspace not found or access denied");
		}

		// Get or create Stripe customer
		let customerId: string | null = wsInfo.stripeCustomerId;
		if (!customerId) {
			const params = new URLSearchParams({
				name: wsInfo.workspaceName,
				"metadata[workspaceId]": args.workspaceId,
			});
			if (wsInfo.billingEmail) {
				params.set("email", wsInfo.billingEmail);
			}

			const createRes = await fetch("https://api.stripe.com/v1/customers", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${stripeSecretKey}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: params.toString(),
			});
			if (!createRes.ok) {
				console.warn(
					`[Billing] createCheckoutSession: Failed to create customer: ${createRes.status}`,
				);
				return { url: null };
			}
			const customer: { id: string } = await createRes.json();
			customerId = customer.id;

			// Link customer to workspace
			await ctx.runMutation(internal.billing.linkStripeCustomer, {
				workspaceId: args.workspaceId,
				stripeCustomerId: customerId,
			});
		}

		// Create checkout session
		const checkoutParams: URLSearchParams = new URLSearchParams({
			customer: customerId,
			"line_items[0][price]": args.priceId,
			"line_items[0][quantity]": "1",
			mode: "subscription",
			success_url: args.successUrl,
			cancel_url: args.cancelUrl,
			"metadata[workspaceId]": args.workspaceId,
		});

		const checkoutRes: Response = await fetch(
			"https://api.stripe.com/v1/checkout/sessions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${stripeSecretKey}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: checkoutParams.toString(),
			},
		);
		if (!checkoutRes.ok) {
			console.warn(
				`[Billing] createCheckoutSession: Failed to create session: ${checkoutRes.status}`,
			);
			return { url: null };
		}

		const session: { url?: string } = await checkoutRes.json();
		return { url: session.url ?? null };
	},
});

/** Create Stripe customer portal session. Returns { url: null } if Stripe not configured. */
export const createPortalSession = action({
	args: {
		workspaceId: v.id("workspaces"),
		returnUrl: v.string(),
	},
	returns: v.object({ url: v.union(v.string(), v.null()) }),
	handler: async (ctx, args): Promise<{ url: string | null }> => {
		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			return { url: null };
		}

		const wsInfo: {
			workspaceName: string;
			billingEmail: string | null;
			stripeCustomerId: string | null;
			plan: "free" | "pro" | "enterprise";
		} | null = await ctx.runQuery(internal.billing.getWorkspaceForCheckout, {
			workspaceId: args.workspaceId,
		});
		if (!wsInfo) {
			throw new Error("Workspace not found or access denied");
		}

		if (!wsInfo.stripeCustomerId) {
			console.warn(
				"[Billing] createPortalSession: No Stripe customer linked to workspace",
			);
			return { url: null };
		}

		const portalParams: URLSearchParams = new URLSearchParams({
			customer: wsInfo.stripeCustomerId,
			return_url: args.returnUrl,
		});

		const portalRes: Response = await fetch(
			"https://api.stripe.com/v1/billing_portal/sessions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${stripeSecretKey}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: portalParams.toString(),
			},
		);
		if (!portalRes.ok) {
			console.warn(
				`[Billing] createPortalSession: Failed to create portal: ${portalRes.status}`,
			);
			return { url: null };
		}

		const portal: { url?: string } = await portalRes.json();
		return { url: portal.url ?? null };
	},
});

// ── Internal Mutations ───────────────────────────────────────────────────────

/** Seed default plans (idempotent — skips existing plans) */
export const seedPlans = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const defaultPlans = [
			{
				key: "free" as const,
				name: "Free",
				description: "For individuals and small teams getting started",
				limits: {
					maxMembers: 5,
					maxStorageGb: 1,
					maxAiMessages: 100,
				},
				features: ["basic_projects", "basic_documents", "basic_whiteboards"],
				isActive: true,
			},
			{
				key: "pro" as const,
				name: "Pro",
				description: "For growing teams that need more power",
				limits: {
					maxMembers: 25,
					maxStorageGb: 10,
					maxAiMessages: 1000,
				},
				features: [
					"basic_projects",
					"basic_documents",
					"basic_whiteboards",
					"advanced_analytics",
					"priority_support",
					"custom_fields",
					"api_access",
				],
				isActive: true,
			},
			{
				key: "enterprise" as const,
				name: "Enterprise",
				description: "For large teams with advanced needs",
				limits: {
					maxMembers: 999999,
					maxStorageGb: 999999,
					maxAiMessages: 999999,
				},
				features: [
					"basic_projects",
					"basic_documents",
					"basic_whiteboards",
					"advanced_analytics",
					"priority_support",
					"custom_fields",
					"api_access",
					"sso",
					"audit_log",
					"dedicated_support",
					"custom_integrations",
				],
				isActive: true,
			},
		];

		for (const plan of defaultPlans) {
			const existing = await ctx.db
				.query("plans")
				.withIndex("by_key", (q) => q.eq("key", plan.key))
				.unique();
			if (!existing) {
				await ctx.db.insert("plans", plan);
			}
		}
		return null;
	},
});

/** Update workspace subscription status (called by Stripe webhook handler) */
export const updateSubscriptionStatus = internalMutation({
	args: {
		stripeCustomerId: v.string(),
		subscriptionId: v.optional(v.string()),
		subscriptionStatus: v.optional(v.string()),
		plan: v.optional(
			v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Find workspace by stripeCustomerId
		const workspace = await ctx.db
			.query("workspaces")
			.withIndex("by_stripe_customer", (q) =>
				q.eq("stripeCustomerId", args.stripeCustomerId),
			)
			.unique();

		if (!workspace) {
			console.warn(
				`[Billing] No workspace found for Stripe customer: ${args.stripeCustomerId}`,
			);
			return null;
		}

		const patch: Record<string, unknown> = {
			updatedAt: Date.now(),
		};
		if (args.subscriptionId !== undefined) {
			patch.subscriptionId = args.subscriptionId;
		}
		if (args.subscriptionStatus !== undefined) {
			patch.subscriptionStatus = args.subscriptionStatus;
		}
		if (args.plan !== undefined) {
			patch.plan = args.plan;
		}

		await ctx.db.patch(workspace._id, patch);
		return null;
	},
});

/** Link a Stripe customer ID to a workspace (called by webhook on checkout) */
export const linkStripeCustomer = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		stripeCustomerId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) {
			console.warn(`[Billing] Workspace not found: ${args.workspaceId}`);
			return null;
		}
		await ctx.db.patch(workspace._id, {
			stripeCustomerId: args.stripeCustomerId,
			updatedAt: Date.now(),
		});
		return null;
	},
});

// ── Seat Sync ─────────────────────────────────────────────────────────────

/** Get workspace details and member count (used by syncSeatCount action) */
export const getWorkspaceSeatInfo = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.union(
		v.object({
			memberCount: v.number(),
			subscriptionId: v.union(v.string(), v.null()),
			stripeCustomerId: v.union(v.string(), v.null()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) return null;

		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		return {
			memberCount: members.length,
			subscriptionId: workspace.subscriptionId ?? null,
			stripeCustomerId: workspace.stripeCustomerId ?? null,
		};
	},
});

/**
 * Sync seat count to Stripe subscription.
 * Fire-and-forget: called via ctx.scheduler.runAfter(0, ...) from member mutations.
 * No-op if Stripe is not configured or workspace has no subscription.
 */
export const syncSeatCount = internalAction({
	args: { workspaceId: v.id("workspaces") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const seatInfo = await ctx.runQuery(internal.billing.getWorkspaceSeatInfo, {
			workspaceId: args.workspaceId,
		});

		if (!seatInfo) {
			console.warn(
				`[Billing] syncSeatCount: workspace not found: ${args.workspaceId}`,
			);
			return null;
		}

		if (!seatInfo.subscriptionId) {
			// No subscription — nothing to sync
			return null;
		}

		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			console.debug(
				"[Billing] syncSeatCount: STRIPE_SECRET_KEY not set, skipping seat sync",
			);
			return null;
		}

		try {
			// Get subscription to find the subscription item ID
			const subResponse = await fetch(
				`https://api.stripe.com/v1/subscriptions/${seatInfo.subscriptionId}`,
				{
					headers: {
						Authorization: `Bearer ${stripeSecretKey}`,
					},
				},
			);

			if (!subResponse.ok) {
				console.warn(
					`[Billing] syncSeatCount: Failed to fetch subscription: ${subResponse.status}`,
				);
				return null;
			}

			const subscription = await subResponse.json();
			const firstItem = subscription.items?.data?.[0];

			if (!firstItem) {
				console.warn("[Billing] syncSeatCount: No subscription items found");
				return null;
			}

			// Update the subscription item quantity
			const updateResponse = await fetch(
				`https://api.stripe.com/v1/subscription_items/${firstItem.id}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${stripeSecretKey}`,
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: `quantity=${seatInfo.memberCount}&proration_behavior=create_prorations`,
				},
			);

			if (!updateResponse.ok) {
				console.warn(
					`[Billing] syncSeatCount: Failed to update quantity: ${updateResponse.status}`,
				);
				return null;
			}

			console.log(
				`[Billing] syncSeatCount: Updated seat count to ${seatInfo.memberCount} for subscription ${seatInfo.subscriptionId}`,
			);
		} catch (error) {
			console.warn(`[Billing] syncSeatCount: Error syncing seats: ${error}`);
		}

		return null;
	},
});
