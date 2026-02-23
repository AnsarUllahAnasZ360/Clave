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
		id: "kimi-k2.5",
		label: "Kimi K2.5",
		description: "High-capacity model deployment for complex tasks",
	},
	{
		id: "gpt-5.2",
		label: "GPT 5.2",
		description: "General chat and analysis model",
	},
];

export const DEFAULT_MODEL_ID = "kimi-k2.5";
