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
	read: () => string | undefined;
};

// Critical detail: each `read()` accesses `process.env.<LITERAL_KEY>` — never
// `process.env[name]`. Bundlers (Webpack, Turbopack) only inline NEXT_PUBLIC_*
// values into the client bundle when the property is read by literal name; a
// dynamic index access stays as a runtime lookup against a (non-existent on
// the client) `process.env` object and the value comes back undefined even
// though it's set in `.env.local`. The literal-only access is what makes the
// validation work in the browser at all.
const normalizeStringEnv = (raw: unknown): string | undefined =>
	typeof raw === "string" && raw.length > 0 ? raw : undefined;

const REQUIRED_VARS: RequiredVarSpec[] = [
	{
		name: "NEXT_PUBLIC_CONVEX_URL",
		description:
			"Convex deployment URL. Without this, every query/mutation fails and the entire app hangs.",
		pattern: /^https:\/\/.+\.convex\.cloud$/,
		read: () => normalizeStringEnv(process.env.NEXT_PUBLIC_CONVEX_URL),
	},
];

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
		const value = spec.read();
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
 * was lying when the var was unset. Literal property access (not dynamic
 * indexing) so bundlers inline the value into client bundles.
 */
export function getConvexUrl(): string {
	const url = normalizeStringEnv(process.env.NEXT_PUBLIC_CONVEX_URL);
	if (!url) {
		throw new Error(
			"NEXT_PUBLIC_CONVEX_URL is not set. Run validateRequiredEnv() at boot to surface this earlier.",
		);
	}
	return url;
}
