/**
 * Migration: Remove the Organization tier.
 *
 * Run once on production BEFORE removing the deprecated table definitions
 * from schema.ts.
 *
 * What it does:
 * 1. Copies billing fields from each organization to its child workspaces
 * 2. Deletes all organizationMembers documents
 * 3. Deletes all organizationInviteCodes documents
 * 4. Deletes all organizations documents
 *
 * Safe to re-run — idempotent. Workspaces that already have billing
 * fields are not overwritten.
 *
 * Usage (Convex dashboard → Functions → run):
 *   migrations/removeOrganizations:run  {}
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: {},
	returns: v.object({
		orgsBillingMigrated: v.number(),
		workspacesBillingCopied: v.number(),
		orgMembersDeleted: v.number(),
		orgInviteCodesDeleted: v.number(),
		orgsDeleted: v.number(),
	}),
	handler: async (ctx) => {
		let orgsBillingMigrated = 0;
		let workspacesBillingCopied = 0;
		let orgMembersDeleted = 0;
		let orgInviteCodesDeleted = 0;
		let orgsDeleted = 0;

		// ── 1. Migrate billing from orgs → workspaces ──────────────────────
		const orgs = await ctx.db.query("organizations").collect();

		for (const org of orgs) {
			// Find workspaces that belonged to this org
			const orgIdStr = org._id as string;
			const allWorkspaces = await ctx.db.query("workspaces").collect();
			const childWorkspaces = allWorkspaces.filter(
				(ws) =>
					// organizationId might be stored as Id<"organizations"> or string
					(ws as Record<string, unknown>).organizationId === orgIdStr,
			);

			if (childWorkspaces.length === 0) continue;

			const hasBilling = org.stripeCustomerId || org.subscriptionId;
			if (!hasBilling) {
				orgsBillingMigrated += 1;
				continue;
			}

			for (const ws of childWorkspaces) {
				// Only copy billing if workspace doesn't already have it
				if (ws.stripeCustomerId || ws.subscriptionId) continue;

				const patch: Record<string, unknown> = {};
				if (org.stripeCustomerId) patch.stripeCustomerId = org.stripeCustomerId;
				if (org.subscriptionId) patch.subscriptionId = org.subscriptionId;
				if (org.subscriptionStatus)
					patch.subscriptionStatus = org.subscriptionStatus;
				if (org.plan) patch.plan = org.plan;
				if (org.trialEndsAt) patch.trialEndsAt = org.trialEndsAt;
				if (org.billingEmail) patch.billingEmail = org.billingEmail;

				if (Object.keys(patch).length > 0) {
					await ctx.db.patch(ws._id, patch);
					workspacesBillingCopied += 1;
				}
			}
			orgsBillingMigrated += 1;
		}

		// ── 2. Delete all organizationMembers ──────────────────────────────
		const orgMembers = await ctx.db.query("organizationMembers").collect();
		for (const member of orgMembers) {
			await ctx.db.delete(member._id);
			orgMembersDeleted += 1;
		}

		// ── 3. Delete all organizationInviteCodes ──────────────────────────
		const orgInviteCodes = await ctx.db
			.query("organizationInviteCodes")
			.collect();
		for (const code of orgInviteCodes) {
			await ctx.db.delete(code._id);
			orgInviteCodesDeleted += 1;
		}

		// ── 4. Delete all organizations ────────────────────────────────────
		for (const org of orgs) {
			await ctx.db.delete(org._id);
			orgsDeleted += 1;
		}

		return {
			orgsBillingMigrated,
			workspacesBillingCopied,
			orgMembersDeleted,
			orgInviteCodesDeleted,
			orgsDeleted,
		};
	},
});
