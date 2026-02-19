"use client";

import { DefaultThreadStoreAuth } from "@blocknote/core/comments";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import {
	ConvexThreadStore,
	type ConvexThreadStoreMutations,
} from "@/lib/convex-thread-store";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * React hook that creates and manages a ConvexThreadStore instance.
 * Subscribes to Convex queries for real-time thread data and feeds updates
 * into the store. Returns a stable store reference.
 */
export function useConvexThreadStore(
	documentId: Id<"documents">,
	userId: string | undefined,
) {
	const threads = useQuery(api.documentComments.listThreadsByDocument, {
		documentId,
	});

	const createThreadMutation = useMutation(api.documentComments.createThread);
	const addCommentMutation = useMutation(api.documentComments.addComment);
	const updateCommentMutation = useMutation(api.documentComments.updateComment);
	const softDeleteCommentMutation = useMutation(
		api.documentComments.softDeleteComment,
	);
	const softDeleteThreadMutation = useMutation(
		api.documentComments.softDeleteThread,
	);
	const resolveThreadMutation = useMutation(api.documentComments.resolveThread);
	const unresolveThreadMutation = useMutation(
		api.documentComments.unresolveThread,
	);
	const addReactionMutation = useMutation(api.documentComments.addReaction);
	const removeReactionMutation = useMutation(
		api.documentComments.removeReaction,
	);

	// Stable mutations object wrapped in callbacks to bridge Convex types
	const mutations: ConvexThreadStoreMutations = {
		createThread: useCallback(
			async (args) => {
				const result = await createThreadMutation({
					documentId: args.documentId as Id<"documents">,
					initialCommentBody: args.initialCommentBody,
					metadata: args.metadata,
					commentMetadata: args.commentMetadata,
				});
				return {
					thread: {
						_id: result.thread._id as string,
						_creationTime: result.thread._creationTime,
					},
					comment: {
						_id: result.comment._id as string,
						_creationTime: result.comment._creationTime,
					},
				};
			},
			[createThreadMutation],
		),
		addComment: useCallback(
			async (args) => {
				const result = await addCommentMutation({
					threadId: args.threadId as Id<"documentThreads">,
					body: args.body,
					metadata: args.metadata,
				});
				return {
					_id: result._id as string,
					_creationTime: result._creationTime,
				};
			},
			[addCommentMutation],
		),
		updateComment: useCallback(
			async (args) => {
				await updateCommentMutation({
					commentId: args.commentId as Id<"documentComments">,
					body: args.body,
					metadata: args.metadata,
				});
			},
			[updateCommentMutation],
		),
		softDeleteComment: useCallback(
			async (args) => {
				await softDeleteCommentMutation({
					commentId: args.commentId as Id<"documentComments">,
				});
			},
			[softDeleteCommentMutation],
		),
		softDeleteThread: useCallback(
			async (args) => {
				await softDeleteThreadMutation({
					threadId: args.threadId as Id<"documentThreads">,
				});
			},
			[softDeleteThreadMutation],
		),
		resolveThread: useCallback(
			async (args) => {
				await resolveThreadMutation({
					threadId: args.threadId as Id<"documentThreads">,
				});
			},
			[resolveThreadMutation],
		),
		unresolveThread: useCallback(
			async (args) => {
				await unresolveThreadMutation({
					threadId: args.threadId as Id<"documentThreads">,
				});
			},
			[unresolveThreadMutation],
		),
		addReaction: useCallback(
			async (args) => {
				await addReactionMutation({
					commentId: args.commentId as Id<"documentComments">,
					emoji: args.emoji,
				});
			},
			[addReactionMutation],
		),
		removeReaction: useCallback(
			async (args) => {
				await removeReactionMutation({
					commentId: args.commentId as Id<"documentComments">,
					emoji: args.emoji,
				});
			},
			[removeReactionMutation],
		),
	};

	const storeRef = useRef<ConvexThreadStore | null>(null);

	// Create or recreate the store when userId changes
	if (!storeRef.current && userId) {
		storeRef.current = new ConvexThreadStore({
			mutations,
			documentId: documentId as string,
			userId,
			auth: new DefaultThreadStoreAuth(userId, "editor"),
		});
	}

	// Feed Convex query updates into the store
	useEffect(() => {
		if (storeRef.current && threads) {
			storeRef.current.updateFromConvex(threads);
		}
	}, [threads]);

	return storeRef.current;
}
