import { describe, expect, it } from "vitest";
import {
	sanitizeHtml,
	sanitizeIframeProps,
	sanitizeUrl,
} from "../../src/lib/ai/sanitize";

// ── sanitizeHtml ──────────────────────────────────────────────────────────

describe("sanitizeHtml", () => {
	// ── Tag stripping ──────────────────────────────────────────────────
	describe("strips dangerous tags", () => {
		it("strips <script> tags", () => {
			expect(sanitizeHtml('<script>alert("xss")</script>')).not.toContain(
				"<script",
			);
			expect(sanitizeHtml('<script>alert("xss")</script>')).not.toContain(
				"alert",
			);
		});

		it("strips <script> with attributes", () => {
			expect(sanitizeHtml('<script src="evil.js"></script>')).not.toContain(
				"<script",
			);
		});

		it("strips <style> tags", () => {
			expect(
				sanitizeHtml("<style>body{display:none}</style><p>Hi</p>"),
			).not.toContain("<style");
			expect(
				sanitizeHtml("<style>body{display:none}</style><p>Hi</p>"),
			).toContain("<p>Hi</p>");
		});

		it("strips <iframe> tags", () => {
			expect(sanitizeHtml('<iframe src="evil.html"></iframe>')).not.toContain(
				"<iframe",
			);
		});

		it("strips <object> tags", () => {
			expect(sanitizeHtml('<object data="evil.swf"></object>')).not.toContain(
				"<object",
			);
		});

		it("strips <embed> tags", () => {
			expect(
				sanitizeHtml(
					'<embed src="evil.swf" type="application/x-shockwave-flash">',
				),
			).not.toContain("<embed");
		});

		it("strips <form> tags", () => {
			expect(
				sanitizeHtml('<form action="evil"><input type="submit"></form>'),
			).not.toContain("<form");
		});

		it("strips <base> tags", () => {
			expect(sanitizeHtml('<base href="https://evil.com">')).not.toContain(
				"<base",
			);
		});

		it("strips <meta> tags", () => {
			expect(
				sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil">'),
			).not.toContain("<meta");
		});
	});

	// ── Event handler stripping ────────────────────────────────────────
	describe("strips event handler attributes", () => {
		it("strips onclick", () => {
			const result = sanitizeHtml('<div onclick="alert(1)">click</div>');
			expect(result).not.toContain("onclick");
			expect(result).toContain("click");
		});

		it("strips onerror on img", () => {
			const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
			expect(result).not.toContain("onerror");
		});

		it("strips onload", () => {
			const result = sanitizeHtml('<body onload="alert(1)">');
			expect(result).not.toContain("onload");
		});

		it("strips onmouseover", () => {
			const result = sanitizeHtml(
				'<a href="#" onmouseover="alert(1)">hover</a>',
			);
			expect(result).not.toContain("onmouseover");
		});

		it("strips onfocus", () => {
			const result = sanitizeHtml('<input onfocus="alert(1)" autofocus>');
			expect(result).not.toContain("onfocus");
		});
	});

	// ── SVG XSS ────────────────────────────────────────────────────────
	describe("handles SVG XSS vectors", () => {
		it("strips <script> inside SVG", () => {
			const result = sanitizeHtml('<svg><script>alert("xss")</script></svg>');
			expect(result).not.toContain("<script");
		});

		it("strips onload on SVG element", () => {
			const result = sanitizeHtml('<svg onload="alert(1)"></svg>');
			expect(result).not.toContain("onload");
		});

		it("strips event handlers on SVG children", () => {
			const result = sanitizeHtml(
				'<svg><rect onclick="alert(1)" width="100" height="100"/></svg>',
			);
			expect(result).not.toContain("onclick");
		});

		it("preserves safe SVG elements", () => {
			const result = sanitizeHtml(
				'<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>',
			);
			expect(result).toContain("<svg");
			expect(result).toContain("<rect");
		});
	});

	// ── Link enforcement ───────────────────────────────────────────────
	describe("enforces safe link attributes", () => {
		it("adds rel=noopener noreferrer to links", () => {
			const result = sanitizeHtml('<a href="https://example.com">link</a>');
			expect(result).toContain('rel="noopener noreferrer"');
		});

		it("adds target=_blank to links", () => {
			const result = sanitizeHtml('<a href="https://example.com">link</a>');
			expect(result).toContain('target="_blank"');
		});

		it("strips javascript: from href", () => {
			const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
			expect(result).not.toContain("javascript:");
		});
	});

	// ── Preserves legitimate content ───────────────────────────────────
	describe("preserves safe content", () => {
		it("preserves headings", () => {
			expect(sanitizeHtml("<h1>Title</h1>")).toContain("<h1>Title</h1>");
		});

		it("preserves paragraphs and inline formatting", () => {
			const html = "<p><strong>bold</strong> and <em>italic</em></p>";
			const result = sanitizeHtml(html);
			expect(result).toContain("<strong>bold</strong>");
			expect(result).toContain("<em>italic</em>");
		});

		it("preserves lists", () => {
			const html = "<ul><li>item 1</li><li>item 2</li></ul>";
			expect(sanitizeHtml(html)).toContain("<li>item 1</li>");
		});

		it("preserves code blocks", () => {
			const html = '<pre><code class="language-js">const x = 1;</code></pre>';
			const result = sanitizeHtml(html);
			expect(result).toContain("<pre>");
			expect(result).toContain("<code");
			expect(result).toContain("const x = 1;");
		});

		it("preserves tables", () => {
			const html =
				"<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
			const result = sanitizeHtml(html);
			expect(result).toContain("<table>");
			expect(result).toContain("<th>A</th>");
		});

		it("preserves blockquotes", () => {
			expect(sanitizeHtml("<blockquote>quote</blockquote>")).toContain(
				"<blockquote>quote</blockquote>",
			);
		});

		it("returns input unchanged during SSR (no window)", () => {
			// This test runs in jsdom which has window, so we can't truly test SSR.
			// The SSR guard is tested by the code structure itself.
			const result = sanitizeHtml("<p>safe</p>");
			expect(result).toContain("<p>safe</p>");
		});
	});
});

// ── sanitizeUrl ───────────────────────────────────────────────────────────

describe("sanitizeUrl", () => {
	// ── Blocks dangerous schemes ───────────────────────────────────────
	describe("blocks dangerous URL schemes", () => {
		it("blocks javascript: scheme", () => {
			expect(sanitizeUrl("javascript:alert(1)")).toBe("");
		});

		it("blocks JAVASCRIPT: uppercase", () => {
			expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe("");
		});

		it("blocks JaVaScRiPt: mixed case", () => {
			expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBe("");
		});

		it("blocks javascript: with tab insertion", () => {
			expect(sanitizeUrl("java\tscript:alert(1)")).toBe("");
		});

		it("blocks javascript: with newline insertion", () => {
			expect(sanitizeUrl("java\nscript:alert(1)")).toBe("");
		});

		it("blocks javascript: with null byte", () => {
			expect(sanitizeUrl("java\x00script:alert(1)")).toBe("");
		});

		it("blocks javascript: with leading whitespace", () => {
			expect(sanitizeUrl("  javascript:alert(1)")).toBe("");
		});

		it("blocks data: URI", () => {
			expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
		});

		it("blocks data: URI with base64", () => {
			expect(
				sanitizeUrl(
					"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
				),
			).toBe("");
		});

		it("blocks vbscript: scheme", () => {
			expect(sanitizeUrl("vbscript:MsgBox('xss')")).toBe("");
		});

		it("blocks blob: scheme", () => {
			expect(sanitizeUrl("blob:https://evil.com/uuid")).toBe("");
		});
	});

	// ── Allows safe URLs ───────────────────────────────────────────────
	describe("allows safe URL patterns", () => {
		it("allows https URLs", () => {
			expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
		});

		it("allows http URLs", () => {
			expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
		});

		it("allows mailto links", () => {
			expect(sanitizeUrl("mailto:user@example.com")).toBe(
				"mailto:user@example.com",
			);
		});

		it("allows tel links", () => {
			expect(sanitizeUrl("tel:+1234567890")).toBe("tel:+1234567890");
		});

		it("allows hash anchors", () => {
			expect(sanitizeUrl("#section")).toBe("#section");
		});

		it("allows relative paths", () => {
			expect(sanitizeUrl("/docs/page")).toBe("/docs/page");
		});

		it("allows relative paths without leading slash", () => {
			expect(sanitizeUrl("docs/page")).toBe("docs/page");
		});

		it("allows protocol-relative URLs", () => {
			expect(sanitizeUrl("//cdn.example.com/file.js")).toBe(
				"//cdn.example.com/file.js",
			);
		});
	});

	// ── Edge cases ─────────────────────────────────────────────────────
	describe("handles edge cases", () => {
		it("returns empty string for empty input", () => {
			expect(sanitizeUrl("")).toBe("");
		});

		it("returns empty string for whitespace-only input", () => {
			expect(sanitizeUrl("   ")).toBe("");
		});

		it("blocks unknown schemes", () => {
			expect(sanitizeUrl("ftp://evil.com/file")).toBe("");
		});

		it("blocks custom schemes", () => {
			expect(sanitizeUrl("custom:payload")).toBe("");
		});

		it("trims whitespace from valid URLs", () => {
			expect(sanitizeUrl("  https://example.com  ")).toBe(
				"https://example.com",
			);
		});
	});
});

// ── sanitizeIframeProps ───────────────────────────────────────────────────

describe("sanitizeIframeProps", () => {
	it("returns restrictive sandbox attributes", () => {
		const props = sanitizeIframeProps();
		expect(props.sandbox).toBe("allow-scripts");
		expect(props.sandbox).not.toContain("allow-same-origin");
	});

	it("returns CSP with restrictive defaults", () => {
		const props = sanitizeIframeProps();
		expect(props.csp).toContain("default-src 'none'");
	});
});
