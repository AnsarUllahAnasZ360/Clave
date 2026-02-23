/**
 * Azure OpenAI Transcription Provider
 *
 * Required env vars (set via `npx convex env set`):
 *   AZURE_RESOURCE_NAME              — Azure resource name (shared with chat)
 *   AZURE_API_KEY                    — Azure API key (shared with chat)
 *
 * Optional env vars:
 *   AZURE_TRANSCRIPTION_DEPLOYMENT   — Transcription deployment name (default: "gpt-4o-transcribe")
 *   AZURE_TRANSCRIPTION_DIARIZE_DEPLOYMENT — Optional diarized transcription deployment
 *   AZURE_TRANSCRIPTION_MODE         — "standard" | "diarized" (default: auto)
 *   AZURE_TRANSCRIPTION_CHUNKING     — "server_vad" | "none" (default: "server_vad")
 *   AZURE_TRANSCRIPTION_API_VERSION  — API version for deployment-based URLs
 *                                      (default: "2025-03-01-preview")
 *   AZURE_TRANSCRIPTION_BASE_URL     — Override base URL if needed
 *
 * NOTE: This module uses process.env (Node.js only). Import it ONLY from
 * "use node" action files. The transcription model is used server-side in
 * Convex actions — never in the browser.
 */
import { createAzure } from "@ai-sdk/azure";

export type TranscriptionMode = "standard" | "diarized";
export type TranscriptionChunkingStrategy = "server_vad" | "none";

const DEFAULT_TRANSCRIPTION_DEPLOYMENT = "gpt-4o-transcribe";
const DEFAULT_TRANSCRIPTION_API_VERSION = "2025-03-01-preview";

// ── Env var helpers ─────────────────────────────────────────────────────

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`[transcription] Missing required environment variable: ${name}. ` +
				`Set it with: npx convex env set ${name} <value>`,
		);
	}
	return value;
}

function inferModeFromDeployment(deployment: string): TranscriptionMode {
	return deployment.toLowerCase().includes("diarize") ? "diarized" : "standard";
}

function normalizeMode(value?: string): TranscriptionMode | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "diarized") return "diarized";
	if (normalized === "standard") return "standard";
	return null;
}

function normalizeChunkingStrategy(
	value?: string,
): TranscriptionChunkingStrategy {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "none") return "none";
	if (normalized === "server_vad") return "server_vad";
	return "server_vad";
}

export type TranscriptionRuntimeConfig = {
	deployment: string;
	mode: TranscriptionMode;
	apiVersion: string;
	chunkingStrategy: TranscriptionChunkingStrategy;
	baseUrl: string;
};

export function getTranscriptionRuntimeConfig(): TranscriptionRuntimeConfig {
	const primaryDeployment =
		process.env.AZURE_TRANSCRIPTION_DEPLOYMENT?.trim() ||
		process.env.AZURE_FORO_TRANSCRIBE_DEPLOYMENT?.trim() ||
		DEFAULT_TRANSCRIPTION_DEPLOYMENT;
	const diarizeDeployment =
		process.env.AZURE_TRANSCRIPTION_DIARIZE_DEPLOYMENT?.trim() || null;
	const configuredMode = normalizeMode(process.env.AZURE_TRANSCRIPTION_MODE);

	let deployment = primaryDeployment;
	let mode = inferModeFromDeployment(primaryDeployment);

	if (configuredMode === "diarized" && diarizeDeployment) {
		deployment = diarizeDeployment;
		mode = "diarized";
	} else if (configuredMode === "standard") {
		deployment = primaryDeployment;
		mode = "standard";
	} else if (!configuredMode && diarizeDeployment) {
		// Auto mode: prefer diarized deployment when available.
		deployment = diarizeDeployment;
		mode = "diarized";
	}

	return {
		deployment,
		mode,
		apiVersion:
			process.env.AZURE_TRANSCRIPTION_API_VERSION ??
			DEFAULT_TRANSCRIPTION_API_VERSION,
		chunkingStrategy: normalizeChunkingStrategy(
			process.env.AZURE_TRANSCRIPTION_CHUNKING,
		),
		baseUrl:
			process.env.AZURE_TRANSCRIPTION_BASE_URL?.trim() ||
			`https://${requireEnv("AZURE_RESOURCE_NAME")}.openai.azure.com`,
	};
}

// ── Azure provider for transcription ────────────────────────────────────
// Uses deployment-based URLs which some transcription deployments require.

const azure = createAzure({
	...(process.env.AZURE_TRANSCRIPTION_BASE_URL
		? { baseURL: process.env.AZURE_TRANSCRIPTION_BASE_URL }
		: { resourceName: requireEnv("AZURE_RESOURCE_NAME") }),
	apiKey: requireEnv("AZURE_API_KEY"),
	useDeploymentBasedUrls: true,
	apiVersion:
		process.env.AZURE_TRANSCRIPTION_API_VERSION ??
		DEFAULT_TRANSCRIPTION_API_VERSION,
});

// ── Transcription model factory ─────────────────────────────────────────

/**
 * Get the configured Azure OpenAI transcription model.
 *
 * Usage in a Convex action:
 * ```ts
 * import { experimental_transcribe as transcribe } from "ai";
 * import { getTranscriptionModel } from "./ai/transcription";
 *
 * const { text } = await transcribe({
 *   model: getTranscriptionModel(),
 *   audio: audioData, // Uint8Array | ArrayBuffer | Buffer | base64 string
 * });
 * ```
 */
export function getTranscriptionModel() {
	const { deployment } = getTranscriptionRuntimeConfig();
	return azure.transcription(deployment);
}
