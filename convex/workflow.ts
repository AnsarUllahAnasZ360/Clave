import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow, {
	workpoolOptions: {
		maxParallelism: 10,
		retryActionsByDefault: true,
		defaultRetryBehavior: {
			maxAttempts: 3,
			initialBackoffMs: 1000,
			base: 2,
		},
	},
});
