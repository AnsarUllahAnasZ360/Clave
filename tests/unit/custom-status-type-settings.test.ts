import { describe, expect, it } from "vitest";

function slugifyKey(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 48);
}

function dedupeKey(base: string, existing: ReadonlySet<string>): string {
	if (!existing.has(base)) return base;
	let i = 2;
	while (existing.has(`${base}_${i}`)) i += 1;
	return `${base}_${i}`;
}

describe("custom status/type key generation", () => {
	it("slugifies labels into stable keys", () => {
		expect(slugifyKey("In progress")).toBe("in_progress");
		expect(slugifyKey("  QA / Review  ")).toBe("qa_review");
		expect(slugifyKey("")).toBe("");
	});

	it("dedupes keys with numeric suffixes", () => {
		const existing = new Set(["triage", "triage_2", "triage_3"]);
		expect(dedupeKey("triage", existing)).toBe("triage_4");
	});
});
