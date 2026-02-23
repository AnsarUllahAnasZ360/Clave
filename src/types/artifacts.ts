// ── Artifact Data Model ──────────────────────────────────────────────────
// Defines the types for rich standalone outputs extracted from AI responses.
// Used by ArtifactCard (STORY-008), ArtifactPanel (STORY-009), and
// artifact type renderers (STORY-010).

export type ArtifactType = "code" | "markdown" | "diagram" | "table";
export type ArtifactStatus = "streaming" | "complete";

export interface ArtifactData {
	/** Stable unique identifier for the artifact */
	id: string;
	/** The kind of content this artifact contains */
	type: ArtifactType;
	/** Human-readable title (e.g., "Priority Queue Implementation") */
	title: string;
	/** The artifact's full content (source code, markdown, mermaid, etc.) */
	content: string;
	/** Whether this artifact is still being streamed or is complete */
	status: ArtifactStatus;
	/** Programming language for code artifacts (e.g., "typescript", "python") */
	language?: string;
}
