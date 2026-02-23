import { Agent } from "@convex-dev/agent";
import { stepCountIs } from "ai";
import { components } from "../_generated/api";
import { chatModel, embeddingModel } from "./providers";
import { subAgentTools } from "./subAgentTool";
import { allTools } from "./tools";

// ── System Prompt ─────────────────────────────────────────────────────────
const CLAVE_SYSTEM_PROMPT = `You are Clave AI, a helpful workspace assistant embedded in a collaborative project management platform. You help teams manage issues, plan projects, write documents, and stay organized. Be concise, direct, and practical. When relevant, reference the workspace context provided.`;

// ── Default Clave AI Agent ────────────────────────────────────────────────
// The primary agent used for all chat interactions.
// All workspace tools (read + write + sub-agent delegation) are registered
// here so every call site automatically has access.
export const claveAgent = new Agent(components.agent, {
	name: "Clave AI",
	languageModel: chatModel,
	textEmbeddingModel: embeddingModel,
	instructions: CLAVE_SYSTEM_PROMPT,
	tools: { ...allTools, ...subAgentTools },
	stopWhen: stepCountIs(15),
	callSettings: {
		maxRetries: 1,
	},
});
