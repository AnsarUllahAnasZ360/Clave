import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { inferStatusCategory } from "../lib/statusCategory";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_BATCHES = 25;

function clampPositiveInt(value: number | undefined, fallback: number) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const normalized = Math.floor(value);
	return normalized > 0 ? normalized : fallback;
}

/**
 * Status-category backfill — fills the `category` field on every
 * `customStatuses` entry that doesn't have one yet, across:
 *   - workspaceSettings.customStatuses
 *   - projects.customStatuses
 *
 * Strategy:
 *   1) Try to match the status key against canonical patterns (precise).
 *   2) Fall back to keyword-matching against the human-readable name
 *      ("Testing in staging" → started).
 *   3) Default to `unstarted` — a safe to-do-ish bucket.
 *
 * Idempotent: a row is only patched if it has at least one customStatuses
 * entry with no `category` set. Re-runs after categories are filled in are
 * no-ops. Safe to schedule via cron or run manually after schema deploy.
 */
export const runBatch = internalMutation({
	args: {
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		workspaceSettingsRowsPatched: v.number(),
		projectRowsPatched: v.number(),
		statusEntriesBackfilled: v.number(),
		remaining: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const batchSize = clampPositiveInt(args.batchSize, DEFAULT_BATCH_SIZE);

		// Workspace settings pass
		const allSettings = await ctx.db.query("workspaceSettings").collect();
		const settingsNeedingBackfill = allSettings.filter((s) =>
			(s.customStatuses ?? []).some((cs) => cs.category === undefined),
		);

		const settingsBatch = settingsNeedingBackfill.slice(0, batchSize);
		let workspaceSettingsRowsPatched = 0;
		let statusEntriesBackfilled = 0;

		for (const settings of settingsBatch) {
			const updated = (settings.customStatuses ?? []).map((cs) => {
				if (cs.category) return cs;
				statusEntriesBackfilled += 1;
				return {
					...cs,
					category: inferStatusCategory({ key: cs.key, name: cs.name }),
				};
			});
			await ctx.db.patch(settings._id, { customStatuses: updated });
			workspaceSettingsRowsPatched += 1;
		}

		// Projects pass — only consume the remaining batch budget so we don't
		// run unbounded work in a single mutation. If workspace settings used
		// the whole budget, projects roll over to the next batch.
		const projectBudget = Math.max(0, batchSize - settingsBatch.length);
		let projectRowsPatched = 0;
		let projectsRemaining = false;

		if (projectBudget > 0) {
			const allProjects = await ctx.db.query("projects").collect();
			const projectsNeedingBackfill = allProjects.filter((p) =>
				(p.customStatuses ?? []).some((cs) => cs.category === undefined),
			);
			const projectsBatch = projectsNeedingBackfill.slice(0, projectBudget);
			projectsRemaining = projectsNeedingBackfill.length > projectsBatch.length;

			for (const project of projectsBatch) {
				const updated = (project.customStatuses ?? []).map((cs) => {
					if (cs.category) return cs;
					statusEntriesBackfilled += 1;
					return {
						...cs,
						category: inferStatusCategory({ key: cs.key, name: cs.name }),
					};
				});
				await ctx.db.patch(project._id, { customStatuses: updated });
				projectRowsPatched += 1;
			}
		} else {
			// Couldn't even start projects this batch → re-check next time.
			const anyProjectsLeft = await ctx.db
				.query("projects")
				.collect()
				.then((rows) =>
					rows.some((p) =>
						(p.customStatuses ?? []).some((cs) => cs.category === undefined),
					),
				);
			projectsRemaining = anyProjectsLeft;
		}

		const remaining =
			settingsNeedingBackfill.length > settingsBatch.length || projectsRemaining;

		return {
			workspaceSettingsRowsPatched,
			projectRowsPatched,
			statusEntriesBackfilled,
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
		workspaceSettingsRowsPatched: v.number(),
		projectRowsPatched: v.number(),
		statusEntriesBackfilled: v.number(),
		remaining: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const batchSize = clampPositiveInt(args.batchSize, DEFAULT_BATCH_SIZE);
		const maxBatches = clampPositiveInt(args.maxBatches, DEFAULT_MAX_BATCHES);

		let batchesRun = 0;
		let workspaceSettingsRowsPatched = 0;
		let projectRowsPatched = 0;
		let statusEntriesBackfilled = 0;
		let remaining = true;

		for (let i = 0; i < maxBatches; i += 1) {
			const allSettings = await ctx.db.query("workspaceSettings").collect();
			const settingsNeedingBackfill = allSettings.filter((s) =>
				(s.customStatuses ?? []).some((cs) => cs.category === undefined),
			);
			const settingsBatch = settingsNeedingBackfill.slice(0, batchSize);

			for (const settings of settingsBatch) {
				const updated = (settings.customStatuses ?? []).map((cs) => {
					if (cs.category) return cs;
					statusEntriesBackfilled += 1;
					return {
						...cs,
						category: inferStatusCategory({ key: cs.key, name: cs.name }),
					};
				});
				await ctx.db.patch(settings._id, { customStatuses: updated });
				workspaceSettingsRowsPatched += 1;
			}

			const projectBudget = Math.max(0, batchSize - settingsBatch.length);
			let projectsBatchLength = 0;
			let projectsHadMore = false;

			if (projectBudget > 0) {
				const allProjects = await ctx.db.query("projects").collect();
				const projectsNeedingBackfill = allProjects.filter((p) =>
					(p.customStatuses ?? []).some((cs) => cs.category === undefined),
				);
				const projectsBatch = projectsNeedingBackfill.slice(0, projectBudget);
				projectsBatchLength = projectsBatch.length;
				projectsHadMore =
					projectsNeedingBackfill.length > projectsBatch.length;

				for (const project of projectsBatch) {
					const updated = (project.customStatuses ?? []).map((cs) => {
						if (cs.category) return cs;
						statusEntriesBackfilled += 1;
						return {
							...cs,
							category: inferStatusCategory({ key: cs.key, name: cs.name }),
						};
					});
					await ctx.db.patch(project._id, { customStatuses: updated });
					projectRowsPatched += 1;
				}
			} else {
				// Saw enough work in workspaceSettings alone to fill the batch.
				projectsHadMore = true;
			}

			batchesRun += 1;
			const settingsHadMore =
				settingsNeedingBackfill.length > settingsBatch.length;

			if (
				settingsBatch.length === 0 &&
				projectsBatchLength === 0 &&
				!settingsHadMore &&
				!projectsHadMore
			) {
				remaining = false;
				break;
			}

			remaining = settingsHadMore || projectsHadMore;
			if (!remaining) break;
		}

		return {
			batchesRun,
			workspaceSettingsRowsPatched,
			projectRowsPatched,
			statusEntriesBackfilled,
			remaining,
		};
	},
});
