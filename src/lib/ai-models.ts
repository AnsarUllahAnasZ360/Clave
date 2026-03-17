/**
 * Available AI models for the chat interface.
 *
 * Each entry maps to an Azure OpenAI deployment selector. Keep IDs aligned with
 * `convex/ai/modelIds.ts` canonical model IDs.
 *
 * To add a new model: define the env var in Convex and add an entry here.
 */
export type AIModel = {
	id: string;
	label: string;
	description: string;
};

export const AI_MODELS: AIModel[] = [
	{
		id: "gpt-5.4",
		label: "GPT 5.4",
		description: "Fast model for chat and embedded AI actions",
	},
	{
		id: "kimi-k2.5",
		label: "Kimi K2.5",
		description: "High-capacity model for complex reasoning tasks",
	},
];

export const DEFAULT_MODEL_ID = "gpt-5.4";
