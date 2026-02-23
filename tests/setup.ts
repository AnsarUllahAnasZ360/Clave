import "@testing-library/jest-dom/vitest";

const isConvexScheduledFunctionError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("Write outside of transaction") &&
		message.includes("_scheduled_functions")
	);
};

const unhandledRejectionHandler = (error: unknown) => {
	if (isConvexScheduledFunctionError(error)) {
		return;
	}

	console.error(error);
};

const uncaughtExceptionHandler = (error: unknown) => {
	if (isConvexScheduledFunctionError(error)) {
		return;
	}

	console.error(error);
};

process.on("unhandledRejection", unhandledRejectionHandler);
process.on("uncaughtException", uncaughtExceptionHandler);

if (!process.env.AZURE_RESOURCE_NAME) {
	process.env.AZURE_RESOURCE_NAME = "test-resource";
}
if (!process.env.AZURE_API_KEY) {
	process.env.AZURE_API_KEY = "test-key-12345";
}
if (!process.env.AZURE_CHAT_MODEL_GPT_5_2) {
	process.env.AZURE_CHAT_MODEL_GPT_5_2 = "gpt-5-2-deployment";
}
if (!process.env.AZURE_CHAT_MODEL_KIMI_25) {
	process.env.AZURE_CHAT_MODEL_KIMI_25 = "kimi-25-deployment";
}
if (!process.env.AZURE_EMBEDDING_DEPLOYMENT) {
	process.env.AZURE_EMBEDDING_DEPLOYMENT = "text-embedding-3-large";
}
