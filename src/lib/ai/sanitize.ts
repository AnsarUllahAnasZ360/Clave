import DOMPurify, { type DOMPurify as DOMPurifyInstance } from "dompurify";

// ── DOMPurify synchronous initialization ──────────────────────────────────
// We intentionally initialize DOMPurify synchronously on first browser call
// so sanitizeHtml never returns raw HTML.

let _purify: DOMPurifyInstance | null = null;

function getPurifySync(): DOMPurifyInstance | null {
	if (typeof window === "undefined") return null;
	if (_purify) return _purify;
	_purify = DOMPurify(window);
	hooksRegistered = false;
	ensureHooks();
	return _purify;
}

/**
 * Preload DOMPurify so subsequent sanitizeHtml calls are synchronous.
 * Call this when AI chat opens to warm the cache.
 */
export async function preloadSanitizer() {
	getPurifySync();
}

// ── DOMPurify hook setup ──────────────────────────────────────────────────
// Registered once per window. Enforces `rel="noopener noreferrer"` and
// `target="_blank"` on every <a> element that passes through sanitizeHtml.
// This is defense-in-depth: individual components may also set these, but
// the hook guarantees coverage for ALL rendering paths.

let hooksRegistered = false;

function ensureHooks(): void {
	if (hooksRegistered || typeof window === "undefined" || !_purify) return;
	hooksRegistered = true;

	_purify.addHook("afterSanitizeAttributes", (node) => {
		// Enforce safe link behavior on <a> elements
		if (node.tagName === "A") {
			const href = node.getAttribute("href") ?? "";
			// Block dangerous schemes even if DOMPurify missed them
			if (isDangerousScheme(href)) {
				node.removeAttribute("href");
				node.setAttribute("role", "link");
				node.setAttribute("aria-disabled", "true");
			}
			// External links get target="_blank" + rel="noopener noreferrer"
			if (node.hasAttribute("href")) {
				node.setAttribute("target", "_blank");
				node.setAttribute("rel", "noopener noreferrer");
			}
		}
	});
}

// ── Dangerous scheme detection ────────────────────────────────────────────

const DANGEROUS_SCHEME_RE = /^\s*(javascript|data|vbscript|blob)\s*:/i;

// Matches ASCII control characters (C0 range 0x00–0x1F + DEL 0x7F) that
// browsers silently strip from URLs. Attackers insert them to bypass
// scheme checks (e.g. `java\tscript:` or `java\nscript:`).
// Uses RegExp constructor so the source doesn't contain literal control
// characters, which Biome's noControlCharactersInRegex rule flags.
// biome-ignore lint/complexity/useRegexLiterals: literal would trigger noControlCharactersInRegex
const CONTROL_CHAR_RE = new RegExp("[\\x00-\\x1f\\x7f]", "g");

/**
 * Check if a URL string starts with a dangerous scheme.
 * Strips ASCII control characters before checking to prevent bypass via
 * tab/newline/null insertion (e.g. `java\tscript:` or `java\nscript:`).
 */
function isDangerousScheme(url: string): boolean {
	const cleaned = url.replace(CONTROL_CHAR_RE, "");
	return DANGEROUS_SCHEME_RE.test(cleaned);
}

// ── sanitizeHtml ──────────────────────────────────────────────────────────

/**
 * Sanitize HTML content using DOMPurify.
 *
 * - Strips `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`,
 *   `<form>`, `<base>`, `<meta>` tags
 * - Strips all `on*` event handler attributes (DOMPurify default)
 * - Preserves safe HTML, SVG (Mermaid diagrams), and MathML
 * - `afterSanitizeAttributes` hook enforces `rel="noopener noreferrer"`
 *   on all `<a>` elements
 *
 * Browser-only — returns the input unchanged during SSR (Streamdown and
 * Mermaid only render client-side, so this is safe).
 */
export function sanitizeHtml(html: string): string {
	if (typeof window === "undefined") return html;
	const purify = getPurifySync();
	if (!purify || typeof purify.sanitize !== "function") return html;
	ensureHooks();
	return purify.sanitize(html, {
		FORBID_TAGS: [
			"script",
			"style",
			"iframe",
			"object",
			"embed",
			"form",
			"base",
			"meta",
		],
		FORBID_ATTR: ["xlink:href"],
		FORCE_BODY: true,
	});
}

// ── sanitizeUrl ───────────────────────────────────────────────────────────

/** Safe protocol allowlist (case-insensitive via regex). */
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|#|\/)/i;

/**
 * Sanitize a URL string. Returns empty string for dangerous protocols.
 * Allows: http, https, mailto, tel, #anchors, relative paths.
 *
 * Defense-in-depth:
 * 1. Strips ASCII control characters that browsers silently ignore
 * 2. Explicitly blocks `javascript:`, `data:`, `vbscript:`, `blob:` schemes
 * 3. Allowlist approach — only known-safe protocols pass
 */
export function sanitizeUrl(url: string): string {
	if (!url) return "";
	// Strip ASCII control chars that could bypass scheme checks
	const cleaned = url.replace(CONTROL_CHAR_RE, "").trim();
	if (!cleaned) return "";

	// Explicit block of dangerous schemes
	if (isDangerousScheme(cleaned)) return "";

	// Allow safe protocols and relative URLs (no colon = relative path)
	if (SAFE_URL_RE.test(cleaned) || !cleaned.includes(":")) {
		return cleaned;
	}

	// Unknown scheme → block
	return "";
}

// ── sanitizeIframeProps ───────────────────────────────────────────────────

/**
 * Returns restrictive sandbox + CSP attributes for iframe elements
 * rendering untrusted content. Not used in Sprint 002 (no iframes) but
 * provided as a utility for future artifact types that may need iframes.
 */
export function sanitizeIframeProps(): {
	sandbox: string;
	csp: string;
} {
	return {
		sandbox: "allow-scripts",
		csp: "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
	};
}
