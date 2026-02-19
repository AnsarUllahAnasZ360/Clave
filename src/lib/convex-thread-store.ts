import type {
	CommentBody,
	CommentData,
	CommentReactionData,
	ThreadData,
	ThreadStore,
	ThreadStoreAuth,
} from "@blocknote/core/comments";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

type RawThread = FunctionReturnType<
	typeof api.documentComments.listThreadsByDocument
>[number];
type RawComment = RawThread["comments"][number];
type RawReaction = RawComment["reactions"][number];

/**
 * Convert raw Convex reaction data to BlockNote CommentReactionData.
 * Groups reactions by emoji and collects user IDs.
 */
function toReactions(raw: RawReaction[]): CommentReactionData[] {
	const grouped = new Map<
		string,
		{ emoji: string; createdAt: number; userIds: string[] }
	>();
	for (const r of raw) {
		const existing = grouped.get(r.emoji);
		if (existing) {
			existing.userIds.push(r.userId);
		} else {
			grouped.set(r.emoji, {
				emoji: r.emoji,
				createdAt: r._creationTime,
				userIds: [r.userId],
			});
		}
	}
	return Array.from(grouped.values()).map((g) => ({
		emoji: g.emoji,
		createdAt: new Date(g.createdAt),
		userIds: g.userIds,
	}));
}

/**
 * Convert raw Convex comment to BlockNote CommentData.
 */
function toCommentData(raw: RawComment): CommentData {
	const base = {
		type: "comment" as const,
		id: raw._id as string,
		userId: raw.authorId as string,
		createdAt: new Date(raw._creationTime),
		updatedAt: new Date(raw.updatedAt ?? raw._creationTime),
		reactions: toReactions(raw.reactions),
		metadata: raw.metadata ? JSON.parse(raw.metadata) : undefined,
	};

	if (raw.deletedAt) {
		return {
			...base,
			deletedAt: new Date(raw.deletedAt),
			body: undefined,
		};
	}
	return {
		...base,
		body: JSON.parse(raw.body) as CommentBody,
	};
}

/**
 * Convert raw Convex thread to BlockNote ThreadData.
 */
function toThreadData(raw: RawThread): ThreadData {
	return {
		type: "thread",
		id: raw._id as string,
		createdAt: new Date(raw._creationTime),
		updatedAt: new Date(raw.resolvedAt ?? raw._creationTime),
		comments: raw.comments.map(toCommentData),
		resolved: raw.resolved,
		resolvedUpdatedAt: raw.resolvedAt ? new Date(raw.resolvedAt) : undefined,
		resolvedBy: raw.resolvedBy as string | undefined,
		metadata: raw.metadata ? JSON.parse(raw.metadata) : undefined,
		deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : undefined,
	};
}

/** Mutation callbacks interface passed from the React hook */
export interface ConvexThreadStoreMutations {
	createThread: (args: {
		documentId: string;
		initialCommentBody: string;
		metadata?: string;
		commentMetadata?: string;
	}) => Promise<{
		thread: { _id: string; _creationTime: number };
		comment: { _id: string; _creationTime: number };
	}>;
	addComment: (args: {
		threadId: string;
		body: string;
		metadata?: string;
	}) => Promise<{ _id: string; _creationTime: number }>;
	updateComment: (args: {
		commentId: string;
		body: string;
		metadata?: string;
	}) => Promise<void>;
	softDeleteComment: (args: { commentId: string }) => Promise<void>;
	softDeleteThread: (args: { threadId: string }) => Promise<void>;
	resolveThread: (args: { threadId: string }) => Promise<void>;
	unresolveThread: (args: { threadId: string }) => Promise<void>;
	addReaction: (args: { commentId: string; emoji: string }) => Promise<void>;
	removeReaction: (args: { commentId: string; emoji: string }) => Promise<void>;
}

/**
 * ConvexThreadStore implements BlockNote's ThreadStore abstract class
 * using Convex mutations for persistence and Convex subscriptions for real-time sync.
 *
 * addThreadToDocument is intentionally undefined so BlockNote falls back to
 * TipTap's setMark command for comment marks, which syncs through ProseMirror sync.
 */
export class ConvexThreadStore implements ThreadStore {
	readonly auth: ThreadStoreAuth;

	private threads: Map<string, ThreadData> = new Map();
	private subscribers: Set<(threads: Map<string, ThreadData>) => void> =
		new Set();
	private mutations: ConvexThreadStoreMutations;
	private documentId: string;
	private userId: string;

	// undefined -- BlockNote falls back to TipTap setMark for comment marks
	addThreadToDocument: undefined;

	constructor(options: {
		mutations: ConvexThreadStoreMutations;
		documentId: string;
		userId: string;
		auth: ThreadStoreAuth;
	}) {
		this.auth = options.auth;
		this.mutations = options.mutations;
		this.documentId = options.documentId;
		this.userId = options.userId;
	}

	/**
	 * Called by the React hook when Convex query data changes.
	 * Updates the local cache and notifies all subscribers.
	 */
	updateFromConvex(rawThreads: RawThread[]) {
		this.threads = new Map();
		for (const raw of rawThreads) {
			this.threads.set(raw._id as string, toThreadData(raw));
		}
		this.notifySubscribers();
	}

	private notifySubscribers() {
		for (const cb of this.subscribers) {
			cb(this.threads);
		}
	}

	async createThread(options: {
		initialComment: { body: CommentBody; metadata?: unknown };
		metadata?: unknown;
	}): Promise<ThreadData> {
		const result = await this.mutations.createThread({
			documentId: this.documentId,
			initialCommentBody: JSON.stringify(options.initialComment.body),
			metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
			commentMetadata: options.initialComment.metadata
				? JSON.stringify(options.initialComment.metadata)
				: undefined,
		});

		const threadData: ThreadData = {
			type: "thread",
			id: result.thread._id,
			createdAt: new Date(result.thread._creationTime),
			updatedAt: new Date(result.thread._creationTime),
			comments: [
				{
					type: "comment",
					id: result.comment._id,
					userId: this.userId,
					createdAt: new Date(result.comment._creationTime),
					updatedAt: new Date(result.comment._creationTime),
					reactions: [],
					metadata: options.initialComment.metadata,
					body: options.initialComment.body,
				},
			],
			resolved: false,
			metadata: options.metadata,
		};

		this.threads.set(threadData.id, threadData);
		this.notifySubscribers();
		return threadData;
	}

	async addComment(options: {
		comment: { body: CommentBody; metadata?: unknown };
		threadId: string;
	}): Promise<CommentData> {
		const result = await this.mutations.addComment({
			threadId: options.threadId,
			body: JSON.stringify(options.comment.body),
			metadata: options.comment.metadata
				? JSON.stringify(options.comment.metadata)
				: undefined,
		});

		const commentData: CommentData = {
			type: "comment",
			id: result._id,
			userId: this.userId,
			createdAt: new Date(result._creationTime),
			updatedAt: new Date(result._creationTime),
			reactions: [],
			metadata: options.comment.metadata,
			body: options.comment.body,
		};

		const thread = this.threads.get(options.threadId);
		if (thread) {
			thread.comments.push(commentData);
			thread.updatedAt = commentData.createdAt;
			this.notifySubscribers();
		}

		return commentData;
	}

	async updateComment(options: {
		comment: { body: CommentBody; metadata?: unknown };
		threadId: string;
		commentId: string;
	}): Promise<void> {
		await this.mutations.updateComment({
			commentId: options.commentId,
			body: JSON.stringify(options.comment.body),
			metadata: options.comment.metadata
				? JSON.stringify(options.comment.metadata)
				: undefined,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			const comment = thread.comments.find((c) => c.id === options.commentId);
			if (comment && !comment.deletedAt) {
				comment.body = options.comment.body;
				comment.updatedAt = new Date();
				this.notifySubscribers();
			}
		}
	}

	async deleteComment(options: {
		threadId: string;
		commentId: string;
	}): Promise<void> {
		await this.mutations.softDeleteComment({
			commentId: options.commentId,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			const idx = thread.comments.findIndex((c) => c.id === options.commentId);
			if (idx !== -1) {
				const comment = thread.comments[idx];
				thread.comments[idx] = {
					type: "comment",
					id: comment.id,
					userId: comment.userId,
					createdAt: comment.createdAt,
					updatedAt: new Date(),
					reactions: comment.reactions,
					metadata: comment.metadata,
					deletedAt: new Date(),
					body: undefined,
				};
				this.notifySubscribers();
			}
		}
	}

	async deleteThread(options: { threadId: string }): Promise<void> {
		await this.mutations.softDeleteThread({
			threadId: options.threadId,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			thread.deletedAt = new Date();
			this.notifySubscribers();
		}
	}

	async resolveThread(options: { threadId: string }): Promise<void> {
		await this.mutations.resolveThread({
			threadId: options.threadId,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			thread.resolved = true;
			thread.resolvedBy = this.userId;
			thread.resolvedUpdatedAt = new Date();
			this.notifySubscribers();
		}
	}

	async unresolveThread(options: { threadId: string }): Promise<void> {
		await this.mutations.unresolveThread({
			threadId: options.threadId,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			thread.resolved = false;
			thread.resolvedBy = undefined;
			thread.resolvedUpdatedAt = new Date();
			this.notifySubscribers();
		}
	}

	async addReaction(options: {
		threadId: string;
		commentId: string;
		emoji: string;
	}): Promise<void> {
		await this.mutations.addReaction({
			commentId: options.commentId,
			emoji: options.emoji,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			const comment = thread.comments.find((c) => c.id === options.commentId);
			if (comment) {
				const existing = comment.reactions.find(
					(r) => r.emoji === options.emoji,
				);
				if (existing) {
					if (!existing.userIds.includes(this.userId)) {
						existing.userIds.push(this.userId);
					}
				} else {
					comment.reactions.push({
						emoji: options.emoji,
						createdAt: new Date(),
						userIds: [this.userId],
					});
				}
				this.notifySubscribers();
			}
		}
	}

	async deleteReaction(options: {
		threadId: string;
		commentId: string;
		emoji: string;
	}): Promise<void> {
		await this.mutations.removeReaction({
			commentId: options.commentId,
			emoji: options.emoji,
		});

		const thread = this.threads.get(options.threadId);
		if (thread) {
			const comment = thread.comments.find((c) => c.id === options.commentId);
			if (comment) {
				const reactionIdx = comment.reactions.findIndex(
					(r) => r.emoji === options.emoji,
				);
				if (reactionIdx !== -1) {
					const reaction = comment.reactions[reactionIdx];
					reaction.userIds = reaction.userIds.filter(
						(id) => id !== this.userId,
					);
					if (reaction.userIds.length === 0) {
						comment.reactions.splice(reactionIdx, 1);
					}
				}
				this.notifySubscribers();
			}
		}
	}

	getThread(threadId: string): ThreadData {
		return this.threads.get(threadId)!;
	}

	getThreads(): Map<string, ThreadData> {
		return this.threads;
	}

	subscribe(cb: (threads: Map<string, ThreadData>) => void): () => void {
		this.subscribers.add(cb);
		return () => {
			this.subscribers.delete(cb);
		};
	}
}
