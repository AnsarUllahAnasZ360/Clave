// Status category model — the 5-bucket Linear-style classification used to
// group statuses across projects on workspace-wide views. Mirror this enum
// in `src/lib/issue-config.ts` (StatusCategory) and `statusCategoryValidator`
// in convex/schema.ts. Keep all three in sync.
export type StatusCategory =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

const KEY_HINTS: Array<{ pattern: RegExp; category: StatusCategory }> = [
	{
		pattern: /^(triage|inbox|new|incoming|needs[_-]?triage)$/i,
		category: "backlog",
	},
	{ pattern: /^(backlog|icebox|someday|later|ideas?)$/i, category: "backlog" },
	{
		pattern: /^(todo|to[_-]?do|ready|next|planned|up[_-]?next)$/i,
		category: "unstarted",
	},
	{
		pattern: /^(in[_-]?progress|doing|started|active|wip|working|started)$/i,
		category: "started",
	},
	{
		pattern:
			/^(in[_-]?review|review|qa|testing?|verify|verification|staging|uat|on[_-]?hold|blocked|paused|waiting)$/i,
		category: "started",
	},
	{
		pattern:
			/^(done|complete|completed|shipped|deployed|released|finished|closed|merged)$/i,
		category: "completed",
	},
	{
		pattern:
			/^(cancel(l)?ed|wontfix|won['_-]?t[_-]?fix|abandoned|rejected|duplicate|invalid|archived)$/i,
		category: "canceled",
	},
];

const NAME_KEYWORDS: Array<{ pattern: RegExp; category: StatusCategory }> = [
	{ pattern: /\b(backlog|icebox|someday|idea)\b/i, category: "backlog" },
	{ pattern: /\b(triage|inbox|new)\b/i, category: "backlog" },
	{ pattern: /\b(todo|ready|next|planned|up next)\b/i, category: "unstarted" },
	{
		pattern: /\b(progress|doing|wip|working|active|started)\b/i,
		category: "started",
	},
	{
		pattern:
			/\b(review|qa|testing|test|staging|verif|uat|hold|block|paused|waiting)\b/i,
		category: "started",
	},
	{
		pattern:
			/\b(done|complet|shipped|deployed|released|finished|closed|merged)\b/i,
		category: "completed",
	},
	{
		pattern: /\b(cancel|won.?t|abandon|reject|duplicate|invalid|archiv)\b/i,
		category: "canceled",
	},
];

/**
 * Infer the most likely status category for a status definition that has no
 * explicit category set (e.g. existing rows before backfill, or new rows
 * created via API without specifying one). Order:
 *
 *   1) Exact key pattern match (precise, deterministic).
 *   2) Name keyword match (looser, handles human-readable labels like
 *      "Testing in staging" → started).
 *   3) Default to `unstarted` — the safest "to-do-ish" bucket; better than
 *      hiding the status under "backlog" or rendering it as "completed".
 *
 * Pure function. Used in two places:
 *   - frontend resolver (`src/hooks/use-effective-issue-config.ts`) for
 *     defensive rendering when a status has no category yet
 *   - backend backfill mutation that one-shot writes inferred categories
 *     for all existing customStatuses entries
 */
export function inferStatusCategory(input: {
	key: string;
	name?: string;
}): StatusCategory {
	for (const { pattern, category } of KEY_HINTS) {
		if (pattern.test(input.key)) return category;
	}
	if (input.name) {
		for (const { pattern, category } of NAME_KEYWORDS) {
			if (pattern.test(input.name)) return category;
		}
	}
	return "unstarted";
}
