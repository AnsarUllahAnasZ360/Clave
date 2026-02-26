/**
 * RAG Pipeline — Configuration & Utilities
 *
 * Provides the initialized RAG component instance, namespace helpers,
 * content hashing, and text chunking utilities for the project-scoped
 * knowledge base.
 *
 * Architecture:
 *   - Each project gets an isolated namespace: `project:{projectId}`
 *   - GitHub code gets a sub-namespace: `project:{projectId}:code`
 *   - Content is filtered by sourceType (issue, document, comment, github_file)
 *   - Incremental sync uses SHA-256 content hashing for change detection
 *
 * Embedding model: Azure text-embedding-3-small (1536 dimensions)
 * Ensure AZURE_EMBEDDING_DEPLOYMENT points to a text-embedding-3-small deployment.
 *
 * NOTE: This module imports from ./providers (which uses process.env).
 * Only import from "use node" action files.
 */
import {
	contentHashFromArrayBuffer,
	defaultChunker,
	RAG,
} from "@convex-dev/rag";
import { components } from "../_generated/api";
import { embeddingModel } from "./providers";

// ── Source type definitions ─────────────────────────────────────────────

export const RAG_SOURCE_TYPES = [
	"issue",
	"document",
	"comment",
	"github_file",
	"doc_page",
] as const;

export type RagSourceType = (typeof RAG_SOURCE_TYPES)[number];

// ── Filter & metadata type schemas ──────────────────────────────────────

type RagFilterTypes = {
	sourceType: RagSourceType;
};

type RagEntryMetadata = {
	sourceId: string;
	projectId: string;
	sourceType: RagSourceType;
	title?: string;
};

// ── RAG instance ────────────────────────────────────────────────────────

/**
 * Project-scoped RAG component for indexing workspace content.
 *
 * Uses Azure text-embedding-3-small (1536 dimensions) and supports
 * sourceType filtering for content-type-specific search.
 */
export const rag = new RAG<RagFilterTypes, RagEntryMetadata>(components.rag, {
	textEmbeddingModel: embeddingModel,
	embeddingDimension: 1536,
	filterNames: ["sourceType"],
});

// ── Namespace helpers ───────────────────────────────────────────────────

/**
 * Get the namespace for project content (issues, docs, comments).
 * All non-code content for a project lives in this namespace.
 */
export function getProjectNamespace(projectId: string): string {
	return `project:${projectId}`;
}

/**
 * Get the namespace for project code (GitHub files).
 * Code chunks are kept separate from content chunks for targeted search.
 */
export function getCodeNamespace(projectId: string): string {
	return `project:${projectId}:code`;
}

/**
 * Namespace for global product documentation pages.
 * Not project-scoped — accessible to all orgs and workspaces.
 */
export const GLOBAL_DOCS_NAMESPACE = "global:docs";

// ── Content hashing ─────────────────────────────────────────────────────

/**
 * Compute a SHA-256 content hash for change detection in incremental sync.
 * Uses Web Crypto API (works in both V8 and Node.js runtimes).
 *
 * @returns Hex-encoded SHA-256 hash string
 */
export async function computeContentHash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	return contentHashFromArrayBuffer(data.buffer as ArrayBuffer);
}

// ── Text chunking ───────────────────────────────────────────────────────

/** Default chunking options tuned for project content (~500 tokens target) */
const DEFAULT_CHUNK_OPTIONS = {
	minLines: 1,
	minCharsSoftLimit: 200,
	maxCharsSoftLimit: 2000,
	maxCharsHardLimit: 4000,
	delimiter: "\n\n",
};

/**
 * Split text into chunks suitable for embedding.
 * Uses @convex-dev/rag's defaultChunker with project-tuned defaults.
 *
 * @param text - The text to chunk
 * @param options - Override default chunking parameters
 * @returns Array of text chunks
 */
export function chunkText(
	text: string,
	options?: {
		minLines?: number;
		minCharsSoftLimit?: number;
		maxCharsSoftLimit?: number;
		maxCharsHardLimit?: number;
		delimiter?: string;
	},
): string[] {
	if (!text.trim()) return [];
	return defaultChunker(text, { ...DEFAULT_CHUNK_OPTIONS, ...options });
}
