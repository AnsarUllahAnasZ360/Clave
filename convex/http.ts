import { registerRoutes } from "@convex-dev/stripe";
import { httpRouter } from "convex/server";
import type Stripe from "stripe";
import { components, internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

/** Extract subscription ID from an invoice (handles new Stripe API structure) */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
	const sub = invoice.parent?.subscription_details?.subscription;
	if (!sub) return null;
	return typeof sub === "string" ? sub : sub.id;
}

// ── Convex Auth routes ───────────────────────────────────────────────────────
auth.addHttpRoutes(http);

// ── Stripe webhook routes ────────────────────────────────────────────────────
registerRoutes(http, components.stripe, {
	webhookPath: "/stripe/webhook",

	events: {
		"checkout.session.completed": async (
			ctx,
			event: Stripe.CheckoutSessionCompletedEvent,
		) => {
			const session = event.data.object;
			const customerId = session.customer as string | null;
			const subscriptionId = session.subscription as string | null;
			const orgId = session.metadata?.orgId;

			if (!customerId) {
				console.warn("[Billing] checkout.session.completed: no customer ID");
				return;
			}

			// Link Stripe customer to org if orgId provided in metadata
			if (orgId) {
				await ctx.runMutation(internal.billing.linkStripeCustomer, {
					organizationId: orgId as never,
					stripeCustomerId: customerId,
				});
			}

			// Determine plan from metadata or default to pro
			const planKey = (session.metadata?.plan ?? "pro") as
				| "free"
				| "pro"
				| "enterprise";

			await ctx.runMutation(internal.billing.updateOrgSubscriptionStatus, {
				stripeCustomerId: customerId,
				subscriptionId: subscriptionId ?? undefined,
				subscriptionStatus: "active",
				plan: planKey,
			});

			console.log(
				`[Billing] Checkout completed for customer ${customerId}, plan: ${planKey}`,
			);
		},

		"customer.subscription.updated": async (
			ctx,
			event: Stripe.CustomerSubscriptionUpdatedEvent,
		) => {
			const subscription = event.data.object;
			const customerId = subscription.customer as string;

			await ctx.runMutation(internal.billing.updateOrgSubscriptionStatus, {
				stripeCustomerId: customerId,
				subscriptionId: subscription.id,
				subscriptionStatus: subscription.status,
			});

			console.log(
				`[Billing] Subscription ${subscription.id} updated: ${subscription.status}`,
			);
		},

		"customer.subscription.deleted": async (
			ctx,
			event: Stripe.CustomerSubscriptionDeletedEvent,
		) => {
			const subscription = event.data.object;
			const customerId = subscription.customer as string;

			// Downgrade to free plan when subscription is cancelled
			await ctx.runMutation(internal.billing.updateOrgSubscriptionStatus, {
				stripeCustomerId: customerId,
				subscriptionId: subscription.id,
				subscriptionStatus: "canceled",
				plan: "free",
			});

			console.log(
				`[Billing] Subscription ${subscription.id} deleted, downgraded to free`,
			);
		},

		"invoice.payment_failed": async (
			ctx,
			event: Stripe.InvoicePaymentFailedEvent,
		) => {
			const invoice = event.data.object;
			const customerId = invoice.customer as string | null;
			const subscriptionId = getInvoiceSubscriptionId(invoice);

			if (!customerId) {
				console.warn("[Billing] invoice.payment_failed: no customer ID");
				return;
			}

			await ctx.runMutation(internal.billing.updateOrgSubscriptionStatus, {
				stripeCustomerId: customerId,
				subscriptionId: subscriptionId ?? undefined,
				subscriptionStatus: "past_due",
			});

			console.log(`[Billing] Payment failed for customer ${customerId}`);
		},

		"invoice.paid": async (ctx, event: Stripe.InvoicePaidEvent) => {
			const invoice = event.data.object;
			const customerId = invoice.customer as string | null;
			const subscriptionId = getInvoiceSubscriptionId(invoice);

			if (!customerId) {
				console.warn("[Billing] invoice.paid: no customer ID");
				return;
			}

			await ctx.runMutation(internal.billing.updateOrgSubscriptionStatus, {
				stripeCustomerId: customerId,
				subscriptionId: subscriptionId ?? undefined,
				subscriptionStatus: "active",
			});

			console.log(`[Billing] Invoice paid for customer ${customerId}`);
		},
	},

	onEvent: async (_ctx, event: Stripe.Event) => {
		console.log(`[Billing] Stripe event received: ${event.type} (${event.id})`);
	},
});

export default http;
