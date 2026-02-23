"use client";

import type { Value } from "platejs";
import { createPlatePlugin } from "platejs/react";
import { BlockDiscussion } from "@/components/ui/block-discussion";
import type { TComment } from "@/components/ui/comment";

export type TDiscussion = {
	id: string;
	comments: TComment[];
	createdAt: Date;
	isResolved: boolean;
	userId: string;
	documentContent?: string;
};

export type TDiscussionUser = {
	id: string;
	avatarUrl: string;
	name: string;
	hue?: number;
};

/** CRUD callbacks for persisting discussion data to an external backend. */
export type DiscussionCallbacks = {
	onCreateDiscussion?: (args: {
		discussionId: string;
		comment: TComment;
		documentContent?: string;
	}) => Promise<void>;
	onAddReply?: (args: {
		discussionId: string;
		comment: TComment;
	}) => Promise<void>;
	onResolveDiscussion?: (args: { discussionId: string }) => Promise<void>;
	onDeleteDiscussion?: (args: { discussionId: string }) => Promise<void>;
	onUpdateComment?: (args: {
		discussionId: string;
		commentId: string;
		contentRich: Value;
	}) => Promise<void>;
	onDeleteComment?: (args: {
		discussionId: string;
		commentId: string;
	}) => Promise<void>;
};

export const discussionPlugin = createPlatePlugin({
	key: "discussion",
	options: {
		callbacks: undefined as DiscussionCallbacks | undefined,
		currentUserId: "" as string,
		discussions: [] as TDiscussion[],
		users: {} as Record<string, TDiscussionUser>,
	},
})
	.configure({
		render: { aboveNodes: BlockDiscussion },
	})
	.extendSelectors(({ getOption }) => ({
		currentUser: () => getOption("users")[getOption("currentUserId")],
		user: (id: string) => getOption("users")[id],
	}));

export const DiscussionKit = [discussionPlugin];
