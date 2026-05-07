/**
 * Boot-time environment validation. Runs as early as possible (when this
 * module is first imported by the Convex provider or the proxy) and fails
 * loudly if a required variable is missing.
 *
 * The point: a typo or unset env var on prod deploy used to silently
 * propagate as `undefined` into the Convex client URL, then surface as
 * vague "queries hang forever" errors at runtime. Catching it here means
 * the next deploy with a missing var gets a clear server log + a thrown
 * Error during boot, instead of an hours-long debug session.
 */

type RequiredVarSpec = {
	name: string;
	description: string;
	pattern?: RegExp;
};

const REQUIRED_VARS: RequiredVarSpec[] = [
	{
		name: "NEXT_PUBLIC_CONVEX_URL",
		description:
			"Convex deployment URL. Without this, every query/mutation fails and the entire app hangs.",
		pattern: /^https:\/\/.+\.convex\.cloud$/,
	},
];

function readEnv(name: string): string | undefined {
	// process.env is the universal source on both server and client when a
	// variable is prefixed NEXT_PUBLIC_*. Avoid optional chaining on a
	// non-existent global.
	const value = process.env[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatMissing(specs: RequiredVarSpec[]): string {
	return specs.map((s) => `  - ${s.name}: ${s.description}`).join("\n");
}

/**
 * Validate all required env vars. Call from any boot path (Convex provider,
 * proxy) — the work is idempotent. Throws a single Error listing every
 * problem so the operator gets the full picture in one message.
 */
export function validateRequiredEnv(): void {
	const missing: RequiredVarSpec[] = [];
	const malformed: RequiredVarSpec[] = [];

	for (const spec of REQUIRED_VARS) {
		const value = readEnv(spec.name);
		if (value === undefined) {
			missing.push(spec);
			continue;
		}
		if (spec.pattern && !spec.pattern.test(value)) {
			malformed.push(spec);
		}
	}

	if (missing.length === 0 && malformed.length === 0) return;

	const lines: string[] = ["Clave: required environment variables not ready."];
	if (missing.length > 0) {
		lines.push("", "Missing:", formatMissing(missing));
	}
	if (malformed.length > 0) {
		lines.push("", "Malformed (set but does not match expected shape):");
		lines.push(formatMissing(malformed));
	}
	throw new Error(lines.join("\n"));
}

/**
 * Read NEXT_PUBLIC_CONVEX_URL after validation. Use this from places that
 * previously did `process.env.NEXT_PUBLIC_CONVEX_URL as string` — the cast
 * was lying when the var was unset.
 */
export function getConvexUrl(): string {
	const url = readEnv("NEXT_PUBLIC_CONVEX_URL");
	if (!url) {
		throw new Error(
			"NEXT_PUBLIC_CONVEX_URL is not set. Run validateRequiredEnv() at boot to surface this earlier.",
		);
	}
	return url;
}
