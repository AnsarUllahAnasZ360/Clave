import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_BATCHES = 25;

function clampPositiveInt(value: number | undefined, fallback: number) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const normalized = Math.floor(value);
	return normalized > 0 ? normalized : fallback;
}

/**
 * Backfill one batch of password accounts to verified state.
 *
 * Idempotent:
 * - Already verified accounts are skipped.
 * - Users that already have emailVerificationTime are skipped.
 */
export const runBatch = internalMutation({
	args: {
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		accountsMarkedVerified: v.number(),
		usersMarkedVerified: v.number(),
		remaining: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const batchSize = clampPositiveInt(args.batchSize, DEFAULT_BATCH_SIZE);

		const passwordAccounts = await ctx.db
			.query("authAccounts")
			.withIndex("providerAndAccountId", (q) => q.eq("provider", "password"))
			.collect();
		const unverifiedAccounts = passwordAccounts.filter(
			(account) => !account.emailVerified,
		);

		const batch = unverifiedAccounts.slice(0, batchSize);
		const remaining = unverifiedAccounts.length > batch.length;

		const now = Date.now();
		let accountsMarkedVerified = 0;
		let usersMarkedVerified = 0;

		for (const account of batch) {
			await ctx.db.patch(account._id, {
				emailVerified: account.providerAccountId,
			});
			accountsMarkedVerified += 1;

			const user = await ctx.db.get(account.userId);
			if (user && !user.emailVerificationTime) {
				await ctx.db.patch(user._id, {
					emailVerificationTime: now,
				});
				usersMarkedVerified += 1;
			}
		}

		return {
			accountsMarkedVerified,
			usersMarkedVerified,
			remaining,
		};
	},
});

/**
 * Convenience runner for rollout: process multiple batches in one call.
 * Safe to re-run until `remaining` is false.
 */
export const runAll = internalMutation({
	args: {
		batchSize: v.optional(v.number()),
		maxBatches: v.optional(v.number()),
	},
	returns: v.object({
		batchesRun: v.number(),
		accountsMarkedVerified: v.number(),
		usersMarkedVerified: v.number(),
		remaining: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const batchSize = clampPositiveInt(args.batchSize, DEFAULT_BATCH_SIZE);
		const maxBatches = clampPositiveInt(args.maxBatches, DEFAULT_MAX_BATCHES);
		let batchesRun = 0;
		let accountsMarkedVerified = 0;
		let usersMarkedVerified = 0;
		let remaining = true;

		for (let index = 0; index < maxBatches; index += 1) {
			const passwordAccounts = await ctx.db
				.query("authAccounts")
				.withIndex("providerAndAccountId", (q) => q.eq("provider", "password"))
				.collect();
			const unverifiedAccounts = passwordAccounts.filter(
				(account) => !account.emailVerified,
			);

			const batch = unverifiedAccounts.slice(0, batchSize);
			remaining = unverifiedAccounts.length > batch.length;

			if (batch.length === 0) {
				remaining = false;
				break;
			}

			const now = Date.now();
			let batchAccountsMarkedVerified = 0;
			let batchUsersMarkedVerified = 0;

			for (const account of batch) {
				await ctx.db.patch(account._id, {
					emailVerified: account.providerAccountId,
				});
				batchAccountsMarkedVerified += 1;

				const user = await ctx.db.get(account.userId);
				if (user && !user.emailVerificationTime) {
					await ctx.db.patch(user._id, {
						emailVerificationTime: now,
					});
					batchUsersMarkedVerified += 1;
				}
			}

			batchesRun += 1;
			accountsMarkedVerified += batchAccountsMarkedVerified;
			usersMarkedVerified += batchUsersMarkedVerified;

			if (!remaining) break;
		}

		return {
			batchesRun,
			accountsMarkedVerified,
			usersMarkedVerified,
			remaining,
		};
	},
});
