/// <reference types="vite/client" />

/**
 * Static drift detector for handwritten Convex returns validators.
 *
 * The motivating incident (b7b0b21): the sprints schema grew a new
 * `statusOverride` optional field, the update mutation set it, but the
 * three handwritten v.object() returns validators on listByWorkspace /
 * listByProject / getById didn't declare it. Strict validation in the
 * Convex production runtime then threw on every sprint that had been
 * edited — taking the entire workspace sidebar down.
 *
 * Why this isn't caught elsewhere:
 * - TypeScript compiles cleanly. Convex's `query()` return-type machinery
 *   is permissive enough that a doc spread doesn't error against an
 *   incomplete validator.
 * - `convex-test` doesn't enforce returns validators at runtime. The
 *   handler returns the doc fine; nothing rejects the extra field.
 * - The bug only surfaces in production, where Convex's actual runtime
 *   *does* validate every output.
 *
 * What this test does:
 * - For each high-risk table (the ones queried from layouts, sidebars,
 *   and global UI — the queries whose failure cascades site-wide), it
 *   compares the source-of-truth schema validator against each
 *   handwritten returns validator that wraps a doc of that table.
 * - The contract: every field present in `schema.tables.<name>.validator`
 *   must also appear in the handwritten validator. Extra computed fields
 *   on the handwritten validator (e.g. `progress`, `issueCount`) are
 *   allowed and listed explicitly per validator.
 *
 * If you add a new optional field to a covered table's schema, add it
 * to the matching handwritten validator. If you intentionally omit a
 * schema field from the returns shape (e.g. for privacy), add it to the
 * `omittedFromReturns` list below — the test then asserts the omission
 * is deliberate, not accidental.
 */

import { describe, expect, it } from "vitest";
import { clientWithContactValidator } from "../../convex/clients";
import {
	issueDocValidator,
	issueWithParentValidator,
} from "../../convex/issues";
import { listDocValidator } from "../../convex/lists";
import { milestoneWithProgressValidator } from "../../convex/milestones";
import { projectDocValidator } from "../../convex/projects";
import schema from "../../convex/schema";
import {
	sprintWithProgressAndProjectValidator,
	sprintWithProgressValidator,
} from "../../convex/sprints";
import { storyDocValidator } from "../../convex/stories";
import { taskDocValidator } from "../../convex/tasks";

// Fields every Convex doc carries automatically. Handwritten validators
// declare these explicitly; the schema validator does not.
const SYSTEM_DOC_FIELDS = ["_id", "_creationTime"] as const;

type ValidatorWithFields = {
	kind: string;
	fields: Record<string, unknown>;
};

function isObjectValidator(v: unknown): v is ValidatorWithFields {
	return (
		typeof v === "object" &&
		v !== null &&
		(v as { kind?: unknown }).kind === "object" &&
		typeof (v as { fields?: unknown }).fields === "object"
	);
}

function getSchemaFields(table: keyof typeof schema.tables): string[] {
	const tableDef = schema.tables[table];
	const validator = (tableDef as unknown as { validator: unknown }).validator;
	if (!isObjectValidator(validator)) {
		throw new Error(`Schema validator for ${String(table)} is not an object`);
	}
	return Object.keys(validator.fields);
}

function getHandwrittenFields(validator: unknown): string[] {
	if (!isObjectValidator(validator)) {
		throw new Error("Provided validator is not an object validator");
	}
	return Object.keys(validator.fields);
}

type DriftCase = {
	name: string;
	table: keyof typeof schema.tables;
	validator: unknown;
	/**
	 * Computed / joined fields the handwritten validator adds on top of
	 * the raw doc shape (e.g. progress counts, parent summaries). They are
	 * legitimate — listed here so the test can ignore them rather than
	 * flag them as unexpected extras.
	 */
	extraFields?: readonly string[];
	/**
	 * Schema fields the handwritten validator deliberately omits (e.g.
	 * for privacy/projection). Listing them here documents the intent.
	 */
	omittedFromReturns?: readonly string[];
};

const DRIFT_CASES: DriftCase[] = [
	{
		name: "sprints / sprintWithProgressValidator",
		table: "sprints",
		validator: sprintWithProgressValidator,
		extraFields: ["issueCount", "completedCount", "progressPercentage"],
	},
	{
		name: "sprints / sprintWithProgressAndProjectValidator",
		table: "sprints",
		validator: sprintWithProgressAndProjectValidator,
		extraFields: [
			"issueCount",
			"completedCount",
			"progressPercentage",
			"projectName",
		],
	},
	{
		name: "projects / projectDocValidator",
		table: "projects",
		validator: projectDocValidator,
	},
	{
		name: "issues / issueDocValidator",
		table: "issues",
		validator: issueDocValidator,
	},
	{
		name: "issues / issueWithParentValidator",
		table: "issues",
		validator: issueWithParentValidator,
		extraFields: ["parent"],
	},
	{
		name: "stories / storyDocValidator",
		table: "stories",
		validator: storyDocValidator,
	},
	{
		name: "tasks / taskDocValidator",
		table: "tasks",
		validator: taskDocValidator,
	},
	{
		name: "lists / listDocValidator",
		table: "lists",
		validator: listDocValidator,
	},
	{
		name: "milestones / milestoneWithProgressValidator",
		table: "milestones",
		validator: milestoneWithProgressValidator,
		extraFields: ["issueCount", "completedCount", "progressPercentage"],
	},
	{
		name: "clients / clientWithContactValidator",
		table: "clients",
		validator: clientWithContactValidator,
		extraFields: ["primaryContactName", "primaryContactEmail"],
	},
];

describe("Convex returns validator drift (static)", () => {
	for (const c of DRIFT_CASES) {
		describe(c.name, () => {
			const schemaFields = new Set(getSchemaFields(c.table));
			const handwrittenFields = new Set(getHandwrittenFields(c.validator));
			const omitted = new Set(c.omittedFromReturns ?? []);
			const extras = new Set(c.extraFields ?? []);

			it("declares every system doc field (_id, _creationTime)", () => {
				const missing = SYSTEM_DOC_FIELDS.filter(
					(f) => !handwrittenFields.has(f),
				);
				expect(
					missing,
					`${c.name} is missing system fields: ${missing.join(", ")}`,
				).toEqual([]);
			});

			it("declares every schema field that isn't deliberately omitted", () => {
				const missing = [...schemaFields].filter(
					(f) => !handwrittenFields.has(f) && !omitted.has(f),
				);
				expect(
					missing,
					`${c.name} is missing fields present in schema.tables.${String(c.table)}: ${missing.join(", ")}. Either add them to the validator, or list them in omittedFromReturns if the omission is deliberate.`,
				).toEqual([]);
			});

			it("does not declare unknown fields", () => {
				const allowed = new Set([
					...schemaFields,
					...SYSTEM_DOC_FIELDS,
					...extras,
				]);
				const unknown = [...handwrittenFields].filter((f) => !allowed.has(f));
				expect(
					unknown,
					`${c.name} declares fields that are neither in the schema nor in extraFields: ${unknown.join(", ")}. Either add to schema, or list in extraFields if computed.`,
				).toEqual([]);
			});
		});
	}
});
