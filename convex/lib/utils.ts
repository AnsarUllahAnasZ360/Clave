/** Generate a URL-safe slug from a name */
export function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Generate an identifier like "CLV-042" from a prefix and number */
export function generateIdentifier(prefix: string, number: number): string {
	return `${prefix}-${String(number).padStart(3, "0")}`;
}

/**
 * Generate a fractional sort order value between two existing values.
 * If no bounds are provided, returns a default starting value.
 * - No before and no after: returns 1.0 (first item)
 * - No before (prepending): returns after / 2
 * - No after (appending): returns before + 1.0
 * - Both provided: returns midpoint (before + after) / 2
 */
export function fractionalIndex(
	before: number | null,
	after: number | null,
): number {
	if (before === null && after === null) {
		return 1.0;
	}
	if (before === null) {
		return (after as number) / 2;
	}
	if (after === null) {
		return before + 1.0;
	}
	return (before + after) / 2;
}
