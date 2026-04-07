import "@testing-library/jest-dom/vitest";

// Some UI dependencies (e.g. cmdk) rely on ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
	// Minimal noop polyfill is sufficient for unit tests.
	(globalThis as any).ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// JSDOM doesn't implement scrollIntoView; some components call it.
if ("Element" in globalThis && !globalThis.Element.prototype.scrollIntoView) {
	// biome-ignore lint/suspicious/noExplicitAny: test-only polyfill
	(globalThis.Element.prototype as any).scrollIntoView = () => {};
}

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
