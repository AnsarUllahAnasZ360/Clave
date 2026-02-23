"use client";

import { getCommentKey } from "@platejs/comment";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { useMutation, useQuery } from "convex/react";
import type { Value } from "platejs";
import { type PlateEditor, useEditorRef } from "platejs/react";
import { useEffect, useMemo, useRef } from "react";
import {
	type DiscussionCallbacks,
	discussionPlugin,
	type TDiscussionUser,
} from "@/components/editor/plugins/discussion-kit";
import type { TComment } from "@/components/ui/comment";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type RawThread = NonNullable<
	ReturnType<typeof useQuery<typeof api.documentComments.listThreadsByDocument>>
>[number];
type RawComment = RawThread["comments"][number];

/**
 * Convert a raw Convex comment body (JSON string) to Plate Value.
 *
 * Old comments use BlockNote CommentBody format (ProseMirror-like nodes with
 * `content` arrays). New comments use Slate Value directly (with `children`
 * arrays). This function detects the format and converts accordingly.
 */
function parseCommentBody(bodyJson: string): Value {
	try {
		const parsed = JSON.parse(bodyJson);

		if (!Array.isArray(parsed) || parsed.length === 0) {
			return [{ type: "p", children: [{ text: "" }] }];
		}

		// Detect format: Slate nodes have `children`, BlockNote has `content`
		const first = parsed[0];
		if (first.children) {
			// Already Slate Value
			return parsed as Value;
		}

		if (first.content || first.type === "paragraph") {
			// BlockNote CommentBody → convert to Slate
			return parsed.map(convertBlockNoteNode) as Value;
		}

		// Unknown format — wrap as paragraph text
		return [{ type: "p", children: [{ text: JSON.stringify(parsed) }] }];
	} catch {
		// Plain text fallback
		return [{ type: "p", children: [{ text: bodyJson || "" }] }];
	}
}

/** Convert a single BlockNote paragraph node to a Slate node. */
function convertBlockNoteNode(node: Record<string, unknown>): {
	type: string;
	children: Record<string, unknown>[];
} {
	const typeMap: Record<string, string> = {
		paragraph: "p",
		heading: "h1",
		bulletListItem: "li",
		numberedListItem: "li",
	};

	const type = typeMap[(node.type as string) || "paragraph"] || "p";
	const content = (node.content as Record<string, unknown>[]) || [];

	return {
		type,
		children:
			content.length > 0 ? content.map(convertBlockNoteInline) : [{ text: "" }],
	};
}

/** Convert a BlockNote inline content node to a Slate leaf. */
function convertBlockNoteInline(
	node: Record<string, unknown>,
): Record<string, unknown> {
	if (node.type === "text") {
		const leaf: Record<string, unknown> = { text: (node.text as string) || "" };
		const styles = node.styles as Record<string, boolean> | undefined;
		if (styles) {
			if (styles.bold) leaf.bold = true;
			if (styles.italic) leaf.italic = true;
			if (styles.underline) leaf.underline = true;
			if (styles.strikethrough) leaf.strikethrough = true;
			if (styles.code) leaf.code = true;
		}
		return leaf;
	}
	// Fallback for unknown inline types
	return { text: (node.text as string) || "" };
}

/** Convert raw Convex thread to Plate TDiscussion. */
function toTDiscussion(
	raw: RawThread,
	threadId: string,
): {
	id: string;
	comments: TComment[];
	createdAt: Date;
	isResolved: boolean;
	userId: string;
} {
	return {
		id: threadId,
		comments: raw.comments
			.filter((c) => !c.deletedAt)
			.map((c) => toTComment(c, threadId)),
		createdAt: new Date(raw._creationTime),
		isResolved: raw.resolved,
		userId: raw.createdBy as string,
	};
}

/** Convert raw Convex comment to Plate TComment. */
function toTComment(raw: RawComment, discussionId: string): TComment {
	return {
		id: raw._id as string,
		contentRich: parseCommentBody(raw.body),
		createdAt: new Date(raw._creationTime),
		discussionId,
		isEdited: !!raw.updatedAt,
		userId: raw.authorId as string,
	};
}

/**
 * Hook that bridges Convex document comments to Plate's discussion system.
 *
 * - Subscribes to real-time thread data from Convex
 * - Transforms raw threads to TDiscussion[] and feeds into discussionPlugin
 * - Resolves user data for avatars/names
 * - Provides CRUD callbacks that persist to Convex mutations
 *
 * Must be called inside a <Plate> component context.
 */
export function usePlateDiscussions(
	documentId: Id<"documents">,
	userId: string | undefined,
) {
	const editor = useEditorRef();

	// Subscribe to thread data — skip in share mode (no userId)
	const threads = useQuery(
		api.documentComments.listThreadsByDocument,
		userId ? { documentId } : "skip",
	);

	// Collect unique user IDs from threads
	const userIds = useMemo(() => {
		if (!threads) return [];
		const ids = new Set<string>();
		for (const thread of threads) {
			ids.add(thread.createdBy as string);
			for (const comment of thread.comments) {
				ids.add(comment.authorId as string);
			}
		}
		// Include current user
		if (userId) ids.add(userId);
		return Array.from(ids);
	}, [threads, userId]);

	// Resolve user info for all participants
	const resolvedUsers = useQuery(
		api.documentComments.resolveUsers,
		userIds.length > 0 ? { userIds } : "skip",
	);

	// Convex mutations
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
	const _unresolveThreadMutation = useMutation(
		api.documentComments.unresolveThread,
	);

	// Stable editor ref for callbacks
	const editorRef = useRef<PlateEditor>(editor);
	editorRef.current = editor;

	// Set current user ID on both discussion and suggestion plugins
	useEffect(() => {
		if (userId) {
			editor.setOption(discussionPlugin, "currentUserId", userId);
			editor.setOption(SuggestionPlugin, "currentUserId", userId);
		}
	}, [userId, editor]);

	// Sync user data to discussion plugin
	useEffect(() => {
		if (!resolvedUsers) return;
		const usersMap: Record<string, TDiscussionUser> = {};
		for (const u of resolvedUsers) {
			if (u) {
				usersMap[u.id] = {
					id: u.id,
					name: u.username,
					avatarUrl: u.avatarUrl,
				};
			}
		}
		editor.setOption(discussionPlugin, "users", usersMap);
	}, [resolvedUsers, editor]);

	// Sync thread data to discussion plugin
	useEffect(() => {
		if (!threads) return;
		const discussions = threads
			.filter((t) => !t.deletedAt)
			.map((t) => toTDiscussion(t, t._id as string));
		editor.setOption(discussionPlugin, "discussions", discussions);
	}, [threads, editor]);

	// CRUD callbacks
	const callbacks: DiscussionCallbacks = useMemo(
		() => ({
			onCreateDiscussion: async ({
				discussionId,
				comment,
				documentContent,
			}) => {
				const ed = editorRef.current;
				const result = await createThreadMutation({
					documentId,
					initialCommentBody: JSON.stringify(comment.contentRich),
					metadata: documentContent
						? JSON.stringify({ documentContent })
						: undefined,
				});

				const serverId = result.thread._id as string;

				// Replace comment marks: client nanoid → server ID
				if (serverId !== discussionId) {
					const oldKey = getCommentKey(discussionId);
					const newKey = getCommentKey(serverId);

					// Set new mark key on all nodes with the old key
					ed.tf.setNodes(
						{ [newKey]: true },
						{
							at: [],
							match: (n) => !!n[oldKey],
							mode: "lowest",
						},
					);
					// Remove old mark key
					ed.tf.unsetNodes([oldKey], {
						at: [],
						match: (n) => !!n[oldKey],
						mode: "lowest",
					});

					// Update the local discussions array to use server ID
					const discussions = ed.getOption(discussionPlugin, "discussions");
					ed.setOption(
						discussionPlugin,
						"discussions",
						discussions.map((d) =>
							d.id === discussionId
								? {
										...d,
										id: serverId,
										comments: d.comments.map((c) => ({
											...c,
											discussionId: serverId,
										})),
									}
								: d,
						),
					);
				}
			},

			onAddReply: async ({ discussionId, comment }) => {
				await addCommentMutation({
					threadId: discussionId as Id<"documentThreads">,
					body: JSON.stringify(comment.contentRich),
				});
			},

			onResolveDiscussion: async ({ discussionId }) => {
				await resolveThreadMutation({
					threadId: discussionId as Id<"documentThreads">,
				});
			},

			onDeleteDiscussion: async ({ discussionId }) => {
				await softDeleteThreadMutation({
					threadId: discussionId as Id<"documentThreads">,
				});
			},

			onUpdateComment: async ({ commentId, contentRich }) => {
				await updateCommentMutation({
					commentId: commentId as Id<"documentComments">,
					body: JSON.stringify(contentRich),
				});
			},

			onDeleteComment: async ({ commentId }) => {
				await softDeleteCommentMutation({
					commentId: commentId as Id<"documentComments">,
				});
			},
		}),
		[
			documentId,
			createThreadMutation,
			addCommentMutation,
			updateCommentMutation,
			softDeleteCommentMutation,
			softDeleteThreadMutation,
			resolveThreadMutation,
		],
	);

	// Set callbacks on the discussion plugin
	useEffect(() => {
		editor.setOption(discussionPlugin, "callbacks", callbacks);
	}, [callbacks, editor]);
}
