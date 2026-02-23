"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import dynamic from "next/dynamic";
import {
	Children,
	isValidElement,
	memo,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import { type Components, type PluginConfig, Streamdown } from "streamdown";
import {
	CodeBlock,
	extractLanguage,
	extractText,
} from "@/components/ai/CodeBlock";

const MermaidDiagram = dynamic(
	() => import("./MermaidDiagram").then((mod) => mod.MermaidDiagram),
	{
		ssr: false,
		loading: () => (
			<div className="h-32 w-full animate-pulse rounded-md bg-neutral-800" />
		),
	},
);

import { TableRenderer } from "@/components/ai/TableRenderer";
import { sanitizeUrl } from "@/lib/ai/sanitize";
import { cn } from "@/lib/utils";

// ── Plugin lazy loading ──────────────────────────────────────────────────
// Light plugins are loaded immediately (small, synchronous).
// Heavy plugins (math) are loaded lazily to reduce initial bundle.
// Mermaid is handled by MermaidDiagram component via pre override,
// so @streamdown/mermaid is no longer loaded as a plugin.

const lightPlugins = { cjk, code } as unknown as PluginConfig;

let _fullPlugins: PluginConfig | null = null;
let _loadingPromise: Promise<PluginConfig> | null = null;

function loadHeavyPlugins(): Promise<PluginConfig> {
	if (_fullPlugins) return Promise.resolve(_fullPlugins);
	if (!_loadingPromise) {
		_loadingPromise = import("@streamdown/math")
			.then((m) => m.math)
			.then((math) => {
				_fullPlugins = { cjk, code, math } as unknown as PluginConfig;
				return _fullPlugins;
			});
	}
	return _loadingPromise;
}

function useStreamdownPlugins(): PluginConfig {
	const [plugins, setPlugins] = useState<PluginConfig>(
		() => _fullPlugins ?? lightPlugins,
	);
	useEffect(() => {
		if (_fullPlugins) return;
		loadHeavyPlugins().then(setPlugins);
	}, []);
	return plugins;
}

// ── Table data extraction ───────────────────────────────────────────────
// Traverses React element tree from a <table> to extract headers and rows
// as string arrays for TableRenderer.

function extractTableData(children: ReactNode): {
	headers: string[];
	rows: string[][];
} | null {
	const childArray = Children.toArray(children);
	let headers: string[] = [];
	const rows: string[][] = [];

	for (const child of childArray) {
		if (!isValidElement(child)) continue;
		const props = child.props as Record<string, unknown>;
		const type = child.type as string;

		if (type === "thead") {
			const trNodes = Children.toArray(props.children as ReactNode);
			for (const tr of trNodes) {
				if (!isValidElement(tr)) continue;
				const trProps = tr.props as Record<string, unknown>;
				const thNodes = Children.toArray(trProps.children as ReactNode);
				headers = thNodes.map((th) => {
					if (!isValidElement(th)) return String(th);
					return extractText(
						(th.props as Record<string, unknown>).children as ReactNode,
					);
				});
			}
		}

		if (type === "tbody") {
			const trNodes = Children.toArray(props.children as ReactNode);
			for (const tr of trNodes) {
				if (!isValidElement(tr)) continue;
				const trProps = tr.props as Record<string, unknown>;
				const tdNodes = Children.toArray(trProps.children as ReactNode);
				const row = tdNodes.map((td) => {
					if (!isValidElement(td)) return String(td);
					return extractText(
						(td.props as Record<string, unknown>).children as ReactNode,
					);
				});
				rows.push(row);
			}
		}
	}

	if (headers.length === 0) return null;
	return { headers, rows };
}

// ── Custom component overrides ──────────────────────────────────────────
// Stable reference — defined outside the component to prevent re-renders.

const streamdownComponents: Components = {
	a: ({ href, children, ...props }) => {
		const safeHref = sanitizeUrl(href ?? "");
		if (!safeHref) {
			return <span {...props}>{children}</span>;
		}
		return (
			<a {...props} href={safeHref} target="_blank" rel="noopener noreferrer">
				{children}
			</a>
		);
	},
	pre: ({ children, ...props }) => {
		// Detect mermaid code blocks and render with MermaidDiagram
		const lang = extractLanguage(children);
		if (lang === "mermaid") {
			const definition = extractText(children);
			return <MermaidDiagram definition={definition} />;
		}
		return (
			<CodeBlock>
				<pre {...props}>{children}</pre>
			</CodeBlock>
		);
	},
	table: ({ children }) => {
		// Extract table data and render with TableRenderer for sorting + styling
		const data = extractTableData(children);
		if (data) {
			return <TableRenderer headers={data.headers} rows={data.rows} />;
		}
		// Fallback: render native table if extraction fails
		return (
			<div className="my-4 w-full overflow-x-auto rounded-md border">
				<table className="w-full caption-bottom text-sm">{children}</table>
			</div>
		);
	},
};

// ── StreamdownRenderer ───────────────────────────────────────────────────

export interface StreamdownRendererProps {
	/** Markdown content string (may be partial during streaming) */
	content: string;
	/** Whether content is actively streaming from the model */
	isStreaming?: boolean;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Core streaming markdown renderer for AI chat messages.
 *
 * Configures Streamdown with:
 * - Syntax-highlighted code blocks (@streamdown/code via Shiki)
 * - Mermaid diagram rendering (via MermaidDiagram component in pre override)
 * - KaTeX math expressions (@streamdown/math, lazy-loaded)
 * - CJK text support (@streamdown/cjk)
 * - Dark/light theme switching via Shiki dual themes
 * - DOMPurify sanitization as defense-in-depth
 * - Custom CodeBlock with language badge, copy button, and word wrap toggle
 * - Sortable TableRenderer for markdown tables
 *
 * Streamdown handles partial markdown gracefully during streaming —
 * unclosed code fences, partial headings, etc. render without breaking.
 */
export const StreamdownRenderer = memo(
	function StreamdownRenderer({
		content,
		isStreaming,
		className,
	}: StreamdownRendererProps) {
		const plugins = useStreamdownPlugins();

		if (!content) return null;

		// Streamdown renders markdown to React elements (not raw HTML), so
		// pre-parse sanitization is unnecessary and harmful — DOMPurify encodes
		// characters like `-->` to `--&gt;`, which breaks Mermaid syntax.
		// Security is handled at the component level:
		//   - Links: sanitizeUrl() in the `a` component override
		//   - Mermaid SVG output: sanitizeHtml() in MermaidDiagram.tsx
		//   - Code blocks: rendered via React elements, no innerHTML

		return (
			<Streamdown
				className={cn(
					"size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
					className,
				)}
				plugins={plugins}
				mode={isStreaming ? "streaming" : "static"}
				shikiTheme={["github-light", "github-dark"]}
				components={streamdownComponents}
			>
				{content}
			</Streamdown>
		);
	},
	(prev, next) =>
		prev.content === next.content && prev.isStreaming === next.isStreaming,
);
