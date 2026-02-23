"use client";

import { Check, Copy, WrapText } from "lucide-react";
import {
	Children,
	isValidElement,
	memo,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from "react";
import { ShikiHighlighter } from "react-shiki";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface CodeBlockProps {
	/** Raw code string (standalone usage, e.g. artifact panel) */
	code?: string;
	/** Programming language identifier */
	language?: string;
	/** Show line numbers alongside code */
	showLineNumbers?: boolean;
	/** Additional CSS classes */
	className?: string;
	/** Pre-highlighted children from Streamdown integration */
	children?: ReactNode;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Recursively extract plain text from a React node tree. */
export function extractText(node: ReactNode): string {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (!node) return "";
	if (Array.isArray(node)) return node.map(extractText).join("");
	if (isValidElement(node)) {
		return extractText(
			(node.props as Record<string, unknown>).children as ReactNode,
		);
	}
	return "";
}

/** Extract language from a code element's className (e.g. "language-typescript"). */
export function extractLanguage(children: ReactNode): string | undefined {
	const nodes = Children.toArray(children);
	for (const child of nodes) {
		if (isValidElement(child)) {
			const className = (child.props as Record<string, unknown>).className as
				| string
				| undefined;
			if (className) {
				const match = className.match(/language-(\w+)/);
				if (match) return match[1];
			}
			// Recurse into children (pre > code nesting)
			const nested = extractLanguage(
				(child.props as Record<string, unknown>).children as ReactNode,
			);
			if (nested) return nested;
		}
	}
	return undefined;
}

// ── Dual theme for standalone ShikiHighlighter ──────────────────────────

const SHIKI_THEMES = {
	light: "github-light",
	dark: "github-dark",
} as const;

// ── CodeBlock ───────────────────────────────────────────────────────────

function CodeBlockInner({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
}: CodeBlockProps) {
	const [copied, setCopied] = useState(false);
	const [wrapLines, setWrapLines] = useState(false);
	const codeRef = useRef<HTMLDivElement>(null);

	const rawCode = code ?? extractText(children);
	const lang = language ?? extractLanguage(children);

	const handleCopy = useCallback(async () => {
		try {
			const text = rawCode || codeRef.current?.textContent || "";
			await navigator.clipboard.writeText(text.trim());
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API may fail in insecure contexts — silent fail
		}
	}, [rawCode]);

	return (
		<div
			className={cn(
				"group/code relative my-4 overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-950",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between bg-zinc-200/60 px-3 py-1.5 dark:bg-zinc-800/60">
				<Badge
					variant="muted"
					className="rounded-md bg-zinc-300/60 font-mono text-[11px] text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-400"
				>
					{lang || "text"}
				</Badge>
				<div className="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-zinc-500 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
						onClick={() => setWrapLines((v) => !v)}
						title={wrapLines ? "Disable word wrap" : "Enable word wrap"}
					>
						<WrapText className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-zinc-500 hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
						onClick={handleCopy}
						title="Copy code"
					>
						{copied ? (
							<Check className="size-3.5 text-green-400" />
						) : (
							<Copy className="size-3.5" />
						)}
					</Button>
				</div>
			</div>

			{/* Code body */}
			<div
				ref={codeRef}
				className={cn(
					// Mobile: smaller font; desktop: normal size
					"text-xs sm:text-sm",
					// Reset Shiki/streamdown pre styling to fit our container
					"[&_pre]:m-0 [&_pre]:rounded-none [&_pre]:border-0 [&_pre]:bg-transparent [&_pre]:px-4 [&_pre]:py-3",
					"[&_code]:bg-transparent",
					wrapLines
						? "[&_pre]:whitespace-pre-wrap [&_pre]:break-words"
						: "[&_pre]:overflow-x-auto [&_pre]:[-webkit-overflow-scrolling:touch]",
					// Line numbers via CSS counters on Shiki .line spans
					showLineNumbers &&
						"[&_code]:counter-reset-[line] [&_.line]:counter-increment-[line] [&_.line]:before:mr-4 [&_.line]:before:inline-block [&_.line]:before:w-6 [&_.line]:before:text-right [&_.line]:before:text-zinc-600 [&_.line]:before:content-[counter(line)]",
				)}
			>
				{children ?? (
					<ShikiHighlighter
						language={lang || "text"}
						theme={SHIKI_THEMES}
						defaultColor="dark"
						showLineNumbers={showLineNumbers}
					>
						{rawCode}
					</ShikiHighlighter>
				)}
			</div>
		</div>
	);
}

export const CodeBlock = memo(
	CodeBlockInner,
	(prev, next) =>
		prev.code === next.code &&
		prev.language === next.language &&
		prev.showLineNumbers === next.showLineNumbers &&
		prev.children === next.children,
);
