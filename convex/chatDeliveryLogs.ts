import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	query,
} from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

const providerValidator = v.literal("google-chat");
const statusValidator = v.union(
	v.literal("queued"),
	v.literal("sent"),
	v.literal("failed"),
	v.literal("dropped"),
);
const targetTypeValidator = v.union(v.literal("dm"), v.literal("space"));
const deliveryHealthStatusValidator = v.union(
	v.literal("healthy"),
	v.literal("degraded"),
	v.literal("open_circuit"),
	v.literal("throttled"),
);
const actionKindValidator = v.union(
	v.literal("issue"),
	v.literal("triage"),
	v.literal("approval"),
	v.literal("unknown"),
);
const actionResultValidator = v.union(
	v.literal("accepted"),
	v.literal("duplicate"),
	v.literal("invalid_auth"),
	v.literal("invalid_payload"),
	v.literal("unsupported_action"),
	v.literal("permission_denied"),
	v.literal("error"),
);

const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 300_000;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
const DELIVERY_WINDOW_MS = 60_000;
const MAX_SENDS_PER_WINDOW = 20;
const DEFAULT_PROVIDER_THROTTLE_MS = 30_000;

const sendQueuedDeliveryRef = makeFunctionReference<
	"action",
	{ deliveryLogId: Id<"chatDeliveryLogs"> },
	{
		status: "sent" | "retry_scheduled" | "failed" | "dropped" | "skipped";
		attemptCount?: number;
		reason?: string;
	}
>("chat/googleChatSender:sendQueuedDelivery");

const deliveryLogValidator = v.object({
	_id: v.id("chatDeliveryLogs"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	targetType: targetTypeValidator,
	targetId: v.string(),
	eventType: v.string(),
	status: statusValidator,
	idempotencyKey: v.string(),
	notificationId: v.optional(v.id("notifications")),
	attemptCount: v.number(),
	maxAttempts: v.number(),
	lastAttemptAt: v.optional(v.number()),
	nextAttemptAt: v.optional(v.number()),
	errorMessage: v.optional(v.string()),
	errorCode: v.optional(v.string()),
	providerMessageName: v.optional(v.string()),
	providerThreadName: v.optional(v.string()),
	deliveredAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const deadLetterValidator = v.object({
	_id: v.id("chatDeliveryDeadLetters"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	deliveryLogId: v.optional(v.id("chatDeliveryLogs")),
	notificationId: v.optional(v.id("notifications")),
	targetType: targetTypeValidator,
	targetId: v.string(),
	eventType: v.string(),
	idempotencyKey: v.string(),
	attemptCount: v.number(),
	maxAttempts: v.number(),
	reason: v.string(),
	errorCode: v.optional(v.string()),
	lastAttemptAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const healthSnapshotValidator = v.object({
	_id: v.id("chatDeliveryHealthSnapshots"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	status: deliveryHealthStatusValidator,
	consecutiveFailures: v.number(),
	circuitOpenedAt: v.optional(v.number()),
	circuitOpenUntil: v.optional(v.number()),
	throttleUntil: v.optional(v.number()),
	rateWindowStartedAt: v.number(),
	rateWindowCount: v.number(),
	totalSent: v.number(),
	totalFailed: v.number(),
	totalDropped: v.number(),
	totalDeadLettered: v.number(),
	totalRetried: v.number(),
	lastDeliveryAt: v.optional(v.number()),
	lastFailureAt: v.optional(v.number()),
	lastErrorCode: v.optional(v.string()),
	lastErrorMessage: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const actionAuditValidator = v.object({
	_id: v.id("chatActionAuditLogs"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	eventId: v.string(),
	idempotencyKey: v.string(),
	actionType: v.string(),
	actionKind: actionKindValidator,
	actorUserId: v.optional(v.id("users")),
	chatUserId: v.optional(v.string()),
	entityType: v.optional(v.string()),
	entityId: v.optional(v.string()),
	result: actionResultValidator,
	message: v.optional(v.string()),
	metadata: v.optional(v.string()),
	createdAt: v.number(),
});

function boundedExponentialBackoffMs(attemptCount: number): number {
	const safeAttempt = Math.max(attemptCount, 1);
	const rawDelay = RETRY_BASE_DELAY_MS * 2 ** (safeAttempt - 1);
	return Math.min(rawDelay, RETRY_MAX_DELAY_MS);
}

function classifyErrorCode(errorCode: string | undefined): string {
	if (!errorCode) return "unknown";

	const normalized = errorCode.toLowerCase();
	if (
		normalized.includes("429") ||
		normalized.includes("throttle") ||
		normalized.includes("rate_limit")
	) {
		return "throttle";
	}
	if (
		normalized.includes("401") ||
		normalized.includes("403") ||
		normalized.includes("auth")
	) {
		return "auth";
	}
	if (
		normalized.includes("500") ||
		normalized.includes("502") ||
		normalized.includes("503") ||
		normalized.includes("504")
	) {
		return "provider_5xx";
	}
	if (normalized.includes("network")) {
		return "network";
	}
	if (
		normalized.includes("invalid") ||
		normalized.includes("missing") ||
		normalized.includes("not_found")
	) {
		return "validation";
	}
	return "other";
}

async function getOrCreateHealthSnapshot(args: {
	ctx: MutationCtx;
	workspaceId: Id<"workspaces">;
	provider: "google-chat";
}) {
	const now = Date.now();
	const existing = await args.ctx.db
		.query("chatDeliveryHealthSnapshots")
		.withIndex("by_workspace_provider", (q) =>
			q.eq("workspaceId", args.workspaceId).eq("provider", args.provider),
		)
		.first();

	if (existing) {
		return existing;
	}

	const snapshotId = await args.ctx.db.insert("chatDeliveryHealthSnapshots", {
		workspaceId: args.workspaceId,
		provider: args.provider,
		status: "healthy",
		consecutiveFailures: 0,
		rateWindowStartedAt: now,
		rateWindowCount: 0,
		totalSent: 0,
		totalFailed: 0,
		totalDropped: 0,
		totalDeadLettered: 0,
		totalRetried: 0,
		createdAt: now,
		updatedAt: now,
	});
	const created = await args.ctx.db.get(snapshotId);
	if (!created) {
		throw new ConvexError("Failed to create chat delivery health snapshot");
	}
	return created;
}

function resolveRateWindowState(args: {
	now: number;
	rateWindowStartedAt: number;
	rateWindowCount: number;
}) {
	if (args.now - args.rateWindowStartedAt >= DELIVERY_WINDOW_MS) {
		return {
			rateWindowStartedAt: args.now,
			rateWindowCount: 0,
		};
	}
	return {
		rateWindowStartedAt: args.rateWindowStartedAt,
		rateWindowCount: args.rateWindowCount,
	};
}

function isThrottleErrorCode(errorCode: string | undefined): boolean {
	if (!errorCode) return false;
	const normalized = errorCode.toLowerCase();
	return (
		normalized.includes("429") ||
		normalized.includes("throttle") ||
		normalized.includes("rate_limit")
	);
}

function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const position = Math.min(
		sorted.length - 1,
		Math.max(0, p * (sorted.length - 1)),
	);
	return sorted[Math.floor(position)] ?? null;
}

export const getById = internalQuery({
	args: {
		deliveryLogId: v.id("chatDeliveryLogs"),
	},
	returns: v.union(deliveryLogValidator, v.null()),
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.deliveryLogId);
		return log ?? null;
	},
});

export const listForNotification = query({
	args: {
		workspaceId: v.id("workspaces"),
		notificationId: v.id("notifications"),
		provider: v.optional(providerValidator),
	},
	returns: v.array(deliveryLogValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const provider = args.provider ?? "google-chat";

		const logs = await ctx.db
			.query("chatDeliveryLogs")
			.withIndex("by_workspace_provider_notification", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("notificationId", args.notificationId),
			)
			.collect();

		return logs.sort((a, b) => a.createdAt - b.createdAt);
	},
});

export const acquireDeliverySlot = internalMutation({
	args: {
		deliveryLogId: v.id("chatDeliveryLogs"),
	},
	returns: v.object({
		allowed: v.boolean(),
		reason: v.optional(v.string()),
		deferUntil: v.optional(v.number()),
	}),
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.deliveryLogId);
		if (!log) {
			return {
				allowed: false,
				reason: "delivery_log_missing",
			};
		}
		if (log.status !== "queued") {
			return {
				allowed: false,
				reason: `delivery_not_queued:${log.status}`,
			};
		}

		const now = Date.now();
		const snapshot = await getOrCreateHealthSnapshot({
			ctx,
			workspaceId: log.workspaceId,
			provider: log.provider,
		});
		const rateWindow = resolveRateWindowState({
			now,
			rateWindowStartedAt: snapshot.rateWindowStartedAt,
			rateWindowCount: snapshot.rateWindowCount,
		});

		if (snapshot.throttleUntil && snapshot.throttleUntil > now) {
			await ctx.db.patch(snapshot._id, {
				status: "throttled",
				updatedAt: now,
			});
			return {
				allowed: false,
				reason: "provider_throttled",
				deferUntil: snapshot.throttleUntil,
			};
		}

		if (
			snapshot.status === "open_circuit" &&
			snapshot.circuitOpenUntil &&
			snapshot.circuitOpenUntil > now
		) {
			return {
				allowed: false,
				reason: "circuit_open",
				deferUntil: snapshot.circuitOpenUntil,
			};
		}

		if (
			snapshot.status === "open_circuit" &&
			snapshot.circuitOpenUntil &&
			snapshot.circuitOpenUntil <= now
		) {
			await ctx.db.patch(snapshot._id, {
				status: "degraded",
				circuitOpenUntil: undefined,
				updatedAt: now,
			});
		}

		if (rateWindow.rateWindowCount >= MAX_SENDS_PER_WINDOW) {
			const deferUntil = rateWindow.rateWindowStartedAt + DELIVERY_WINDOW_MS;
			await ctx.db.patch(snapshot._id, {
				status: "throttled",
				throttleUntil: deferUntil,
				rateWindowStartedAt: rateWindow.rateWindowStartedAt,
				rateWindowCount: rateWindow.rateWindowCount,
				updatedAt: now,
			});
			return {
				allowed: false,
				reason: "local_rate_limited",
				deferUntil,
			};
		}

		await ctx.db.patch(snapshot._id, {
			rateWindowStartedAt: rateWindow.rateWindowStartedAt,
			rateWindowCount: rateWindow.rateWindowCount + 1,
			updatedAt: now,
		});

		return {
			allowed: true,
		};
	},
});

export const deferDelivery = internalMutation({
	args: {
		deliveryLogId: v.id("chatDeliveryLogs"),
		deferUntil: v.number(),
		reason: v.string(),
		errorCode: v.optional(v.string()),
	},
	returns: v.object({
		scheduled: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.deliveryLogId);
		if (!log) {
			return { scheduled: false };
		}

		const now = Date.now();
		const runAfterMs = Math.max(0, args.deferUntil - now);
		await ctx.db.patch(log._id, {
			status: "queued",
			nextAttemptAt: args.deferUntil,
			errorMessage: args.reason,
			errorCode: args.errorCode,
			updatedAt: now,
		});
		await ctx.scheduler.runAfter(runAfterMs, sendQueuedDeliveryRef, {
			deliveryLogId: log._id,
		});

		return { scheduled: true };
	},
});

export const markSent = internalMutation({
	args: {
		deliveryLogId: v.id("chatDeliveryLogs"),
		providerMessageName: v.optional(v.string()),
		providerThreadName: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.deliveryLogId);
		if (!log) return null;

		const now = Date.now();
		await ctx.db.patch(log._id, {
			status: "sent",
			attemptCount: log.attemptCount + 1,
			lastAttemptAt: now,
			nextAttemptAt: undefined,
			errorMessage: undefined,
			errorCode: undefined,
			providerMessageName: args.providerMessageName,
			providerThreadName: args.providerThreadName,
			deliveredAt: now,
			updatedAt: now,
		});

		const snapshot = await getOrCreateHealthSnapshot({
			ctx,
			workspaceId: log.workspaceId,
			provider: log.provider,
		});
		await ctx.db.patch(snapshot._id, {
			status: "healthy",
			consecutiveFailures: 0,
			circuitOpenedAt: undefined,
			circuitOpenUntil: undefined,
			throttleUntil: undefined,
			totalSent: snapshot.totalSent + 1,
			lastDeliveryAt: now,
			lastErrorCode: undefined,
			lastErrorMessage: undefined,
			updatedAt: now,
		});

		return null;
	},
});

export const markDropped = internalMutation({
	args: {
		deliveryLogId: v.id("chatDeliveryLogs"),
		reason: v.string(),
		errorCode: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.deliveryLogId);
		if (!log) return null;

		const now = Date.now();
		await ctx.db.patch(log._id, {
			status: "dropped",
			attemptCount: log.attemptCount + 1,
			lastAttemptAt: now,
			nextAttemptAt: undefined,
			errorMessage: args.reason,
			errorCode: args.errorCode,
			updatedAt: now,
		});

		const snapshot = await getOrCreateHealthSnapshot({
			ctx,
			workspaceId: log.workspaceId,
			provider: log.provider,
		});
		await ctx.db.patch(snapshot._id, {
			status: "degraded",
			consecutiveFailures: snapshot.consecutiveFailures + 1,
			totalDropped: snapshot.totalDropped + 1,
			totalFailed: snapshot.totalFailed + 1,
			lastFailureAt: now,
			lastErrorCode: args.errorCode,
			lastErrorMessage: args.reason,
			updatedAt: now,
		});

		return null;
	},
});

export const recordFailure = internalMutation({
	args: {
		deliveryLogId: v.id("chatDeliveryLogs"),
		errorMessage: v.string(),
		errorCode: v.optional(v.string()),
		retryable: v.boolean(),
		retryAfterMs: v.optional(v.number()),
	},
	returns: v.object({
		status: v.union(v.literal("retry_scheduled"), v.literal("failed")),
		attemptCount: v.number(),
		nextAttemptAt: v.union(v.number(), v.null()),
	}),
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.deliveryLogId);
		if (!log) {
			return {
				status: "failed" as const,
				attemptCount: 0,
				nextAttemptAt: null,
			};
		}

		const now = Date.now();
		const attemptCount = log.attemptCount + 1;
		const maxAttempts = log.maxAttempts > 0 ? log.maxAttempts : 3;
		const canRetry = args.retryable && attemptCount < maxAttempts;

		const snapshot = await getOrCreateHealthSnapshot({
			ctx,
			workspaceId: log.workspaceId,
			provider: log.provider,
		});

		const consecutiveFailures = snapshot.consecutiveFailures + 1;
		const throttleError = isThrottleErrorCode(args.errorCode);
		const throttleUntil = throttleError
			? now + Math.max(args.retryAfterMs ?? DEFAULT_PROVIDER_THROTTLE_MS, 1_000)
			: undefined;

		let healthStatus: "healthy" | "degraded" | "open_circuit" | "throttled" =
			"degraded";
		let circuitOpenedAt: number | undefined = snapshot.circuitOpenedAt;
		let circuitOpenUntil: number | undefined = snapshot.circuitOpenUntil;
		if (throttleError) {
			healthStatus = "throttled";
		}
		if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
			healthStatus = "open_circuit";
			circuitOpenedAt = now;
			circuitOpenUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
		}

		if (!canRetry) {
			await ctx.db.patch(log._id, {
				status: "failed",
				attemptCount,
				lastAttemptAt: now,
				nextAttemptAt: undefined,
				errorMessage: args.errorMessage,
				errorCode: args.errorCode,
				updatedAt: now,
			});

			await ctx.db.insert("chatDeliveryDeadLetters", {
				workspaceId: log.workspaceId,
				provider: log.provider,
				deliveryLogId: log._id,
				notificationId: log.notificationId,
				targetType: log.targetType,
				targetId: log.targetId,
				eventType: log.eventType,
				idempotencyKey: log.idempotencyKey,
				attemptCount,
				maxAttempts,
				reason: args.errorMessage,
				errorCode: args.errorCode,
				lastAttemptAt: now,
				createdAt: now,
				updatedAt: now,
			});

			await ctx.db.patch(snapshot._id, {
				status: healthStatus,
				consecutiveFailures,
				circuitOpenedAt,
				circuitOpenUntil,
				throttleUntil: throttleUntil ?? snapshot.throttleUntil,
				totalFailed: snapshot.totalFailed + 1,
				totalDeadLettered: snapshot.totalDeadLettered + 1,
				lastFailureAt: now,
				lastErrorCode: args.errorCode,
				lastErrorMessage: args.errorMessage,
				updatedAt: now,
			});

			return {
				status: "failed" as const,
				attemptCount,
				nextAttemptAt: null,
			};
		}

		let delayMs = boundedExponentialBackoffMs(attemptCount);
		if (throttleUntil && throttleUntil > now) {
			delayMs = Math.max(delayMs, throttleUntil - now);
		}
		if (circuitOpenUntil && circuitOpenUntil > now) {
			delayMs = Math.max(delayMs, circuitOpenUntil - now);
		}
		const nextAttemptAt = now + delayMs;

		await ctx.db.patch(log._id, {
			status: "queued",
			attemptCount,
			lastAttemptAt: now,
			nextAttemptAt,
			errorMessage: args.errorMessage,
			errorCode: args.errorCode,
			updatedAt: now,
		});
		await ctx.scheduler.runAfter(delayMs, sendQueuedDeliveryRef, {
			deliveryLogId: log._id,
		});

		await ctx.db.patch(snapshot._id, {
			status: healthStatus,
			consecutiveFailures,
			circuitOpenedAt,
			circuitOpenUntil,
			throttleUntil: throttleUntil ?? snapshot.throttleUntil,
			totalFailed: snapshot.totalFailed + 1,
			totalRetried: snapshot.totalRetried + 1,
			lastFailureAt: now,
			lastErrorCode: args.errorCode,
			lastErrorMessage: args.errorMessage,
			updatedAt: now,
		});

		return {
			status: "retry_scheduled" as const,
			attemptCount,
			nextAttemptAt,
		};
	},
});

/** Check if an action with this idempotency key was already processed. */
export const checkIdempotency = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		idempotencyKey: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("chatActionAuditLogs")
			.withIndex("by_idempotency_key", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("idempotencyKey", args.idempotencyKey),
			)
			.first();
		return existing !== null;
	},
});

export const recordActionAudit = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: providerValidator,
		eventId: v.string(),
		idempotencyKey: v.string(),
		actionType: v.string(),
		actionKind: actionKindValidator,
		actorUserId: v.optional(v.id("users")),
		chatUserId: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		result: actionResultValidator,
		message: v.optional(v.string()),
		metadata: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.insert("chatActionAuditLogs", {
			workspaceId: args.workspaceId,
			provider: args.provider,
			eventId: args.eventId,
			idempotencyKey: args.idempotencyKey,
			actionType: args.actionType,
			actionKind: args.actionKind,
			actorUserId: args.actorUserId,
			chatUserId: args.chatUserId,
			entityType: args.entityType,
			entityId: args.entityId,
			result: args.result,
			message: args.message,
			metadata: args.metadata,
			createdAt: Date.now(),
		});
		return null;
	},
});

export const getDeliveryDiagnostics = query({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		lookbackHours: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		provider: providerValidator,
		lookbackHours: v.number(),
		windowStart: v.number(),
		totals: v.object({
			total: v.number(),
			queued: v.number(),
			sent: v.number(),
			failed: v.number(),
			dropped: v.number(),
			deadLetters: v.number(),
			successRate: v.number(),
		}),
		latency: v.object({
			averageMs: v.union(v.number(), v.null()),
			p95Ms: v.union(v.number(), v.null()),
		}),
		retryDepth: v.object({
			noRetry: v.number(),
			oneToTwoRetries: v.number(),
			threePlusRetries: v.number(),
		}),
		errorClasses: v.array(
			v.object({
				errorClass: v.string(),
				count: v.number(),
			}),
		),
		healthSnapshot: v.union(healthSnapshotValidator, v.null()),
		deadLetters: v.array(deadLetterValidator),
		actionAudits: v.array(actionAuditValidator),
	}),
	handler: async (ctx, args) => {
		const { member } = await requireWorkspaceMember(ctx, args.workspaceId);
		if (member.role !== "admin") {
			throw new ConvexError("Admin access required");
		}

		const provider = args.provider ?? "google-chat";
		const lookbackHours = Math.max(
			1,
			Math.min(args.lookbackHours ?? 24, 24 * 14),
		);
		const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
		const windowStart = Date.now() - lookbackHours * 60 * 60 * 1000;

		const [logs, deadLetters, healthSnapshot, actionAudits] = await Promise.all(
			[
				ctx.db
					.query("chatDeliveryLogs")
					.withIndex("by_workspace_provider_created_at", (q) =>
						q
							.eq("workspaceId", args.workspaceId)
							.eq("provider", provider)
							.gte("createdAt", windowStart),
					)
					.collect(),
				ctx.db
					.query("chatDeliveryDeadLetters")
					.withIndex("by_workspace_provider_created_at", (q) =>
						q
							.eq("workspaceId", args.workspaceId)
							.eq("provider", provider)
							.gte("createdAt", windowStart),
					)
					.order("desc")
					.take(limit),
				ctx.db
					.query("chatDeliveryHealthSnapshots")
					.withIndex("by_workspace_provider", (q) =>
						q.eq("workspaceId", args.workspaceId).eq("provider", provider),
					)
					.first(),
				ctx.db
					.query("chatActionAuditLogs")
					.withIndex("by_workspace_provider_created_at", (q) =>
						q
							.eq("workspaceId", args.workspaceId)
							.eq("provider", provider)
							.gte("createdAt", windowStart),
					)
					.order("desc")
					.take(limit),
			],
		);

		let queued = 0;
		let sent = 0;
		let failed = 0;
		let dropped = 0;
		let noRetry = 0;
		let oneToTwoRetries = 0;
		let threePlusRetries = 0;
		const latencyValues: number[] = [];
		const errorClassCounts = new Map<string, number>();

		for (const log of logs) {
			if (log.status === "queued") queued += 1;
			if (log.status === "sent") {
				sent += 1;
				if (typeof log.deliveredAt === "number") {
					const latency = log.deliveredAt - log.createdAt;
					if (latency >= 0) latencyValues.push(latency);
				}
			}
			if (log.status === "failed") failed += 1;
			if (log.status === "dropped") dropped += 1;

			const retries = Math.max(0, log.attemptCount - 1);
			if (retries === 0) noRetry += 1;
			else if (retries <= 2) oneToTwoRetries += 1;
			else threePlusRetries += 1;

			if (log.status === "failed" || log.status === "dropped") {
				const errorClass = classifyErrorCode(log.errorCode);
				errorClassCounts.set(
					errorClass,
					(errorClassCounts.get(errorClass) ?? 0) + 1,
				);
			}
		}

		const terminal = sent + failed + dropped;
		const successRate = terminal === 0 ? 0 : sent / terminal;
		const latencyAverage =
			latencyValues.length === 0
				? null
				: Math.round(
						latencyValues.reduce((total, value) => total + value, 0) /
							latencyValues.length,
					);
		const latencyP95 = percentile(latencyValues, 0.95);

		return {
			provider,
			lookbackHours,
			windowStart,
			totals: {
				total: logs.length,
				queued,
				sent,
				failed,
				dropped,
				deadLetters: deadLetters.length,
				successRate,
			},
			latency: {
				averageMs: latencyAverage,
				p95Ms: latencyP95,
			},
			retryDepth: {
				noRetry,
				oneToTwoRetries,
				threePlusRetries,
			},
			errorClasses: [...errorClassCounts.entries()]
				.map(([errorClass, count]) => ({
					errorClass,
					count,
				}))
				.sort(
					(a, b) =>
						b.count - a.count || a.errorClass.localeCompare(b.errorClass),
				),
			healthSnapshot: healthSnapshot ?? null,
			deadLetters,
			actionAudits,
		};
	},
});
