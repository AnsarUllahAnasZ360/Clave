"use client";

import {
	BLOCK_CONTEXT_MENU_ID,
	BlockMenuPlugin,
	BlockSelectionPlugin,
} from "@platejs/selection/react";
import { KEYS, type NodeEntry, type TElement } from "platejs";
import { useEditorPlugin, usePlateState, usePluginOption } from "platejs/react";
import * as React from "react";

import { commentPlugin } from "@/components/editor/plugins/comment-kit";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";

export function BlockContextMenu({ children }: { children: React.ReactNode }) {
	const { api, editor } = useEditorPlugin(BlockMenuPlugin);
	const isTouch = useIsTouchDevice();
	const [readOnly] = usePlateState("readOnly");
	const openId = usePluginOption(BlockMenuPlugin, "openId");
	const isOpen = openId === BLOCK_CONTEXT_MENU_ID;

	const handleTurnInto = React.useCallback(
		(type: string) => {
			editor
				.getApi(BlockSelectionPlugin)
				.blockSelection.getNodes()
				.forEach(([node, path]) => {
					if (node[KEYS.listType]) {
						editor.tf.unsetNodes([KEYS.listType, "indent"], {
							at: path,
						});
					}

					editor.tf.toggleBlock(type, { at: path });
				});
		},
		[editor],
	);

	const handleAlign = React.useCallback(
		(align: "center" | "left" | "right") => {
			editor
				.getTransforms(BlockSelectionPlugin)
				.blockSelection.setNodes({ align });
		},
		[editor],
	);

	const handleCopy = React.useCallback(() => {
		const nodes = editor.getApi(BlockSelectionPlugin).blockSelection.getNodes();

		if (nodes.length > 0) {
			const text = nodes.map(([node]) => editor.api.string(node)).join("\n");
			navigator.clipboard.writeText(text);
		}
	}, [editor]);

	const handleComment = React.useCallback(() => {
		const nodes = editor.getApi(BlockSelectionPlugin).blockSelection.getNodes();

		if (nodes.length > 0) {
			const [, path] = nodes[0] as NodeEntry<TElement>;
			editor.tf.select(path);
			editor.getTransforms(commentPlugin).comment.setDraft();
		}
	}, [editor]);

	const handleMoveUp = React.useCallback(() => {
		const nodes = editor
			.getApi(BlockSelectionPlugin)
			.blockSelection.getNodes({ sort: true });

		if (nodes.length > 0) {
			const [, firstPath] = nodes[0] as NodeEntry<TElement>;
			if (firstPath[0] > 0) {
				for (const [, path] of nodes) {
					editor.tf.moveNodes({
						at: path,
						to: [path[0] - 1],
					});
				}
			}
		}
	}, [editor]);

	const handleMoveDown = React.useCallback(() => {
		const nodes = editor
			.getApi(BlockSelectionPlugin)
			.blockSelection.getNodes({ sort: true });

		if (nodes.length > 0) {
			const [, lastPath] = nodes[nodes.length - 1] as NodeEntry<TElement>;
			const totalNodes = editor.children.length;
			if (lastPath[0] < totalNodes - 1) {
				for (let i = nodes.length - 1; i >= 0; i--) {
					const [, path] = nodes[i] as NodeEntry<TElement>;
					editor.tf.moveNodes({
						at: path,
						to: [path[0] + 1],
					});
				}
			}
		}
	}, [editor]);

	if (isTouch) {
		return children;
	}

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (!open) {
					api.blockMenu.hide();
				}
			}}
			modal={false}
		>
			<ContextMenuTrigger
				asChild
				onContextMenu={(event) => {
					const dataset = (event.target as HTMLElement).dataset;
					const disabled =
						dataset?.slateEditor === "true" ||
						readOnly ||
						dataset?.plateOpenContextMenu === "false";

					if (disabled) return event.preventDefault();

					setTimeout(() => {
						api.blockMenu.show(BLOCK_CONTEXT_MENU_ID, {
							x: event.clientX,
							y: event.clientY,
						});
					}, 0);
				}}
			>
				<div className="w-full">{children}</div>
			</ContextMenuTrigger>
			{isOpen && (
				<ContextMenuContent
					className="w-64"
					onCloseAutoFocus={(e) => {
						e.preventDefault();
						editor.getApi(BlockSelectionPlugin).blockSelection.focus();
					}}
				>
					<ContextMenuGroup>
						<ContextMenuItem
							onClick={() => {
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.removeNodes();
								editor.tf.focus();
							}}
						>
							Delete
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() => {
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.duplicate();
							}}
						>
							Duplicate
						</ContextMenuItem>
						<ContextMenuItem onClick={handleCopy}>Copy</ContextMenuItem>
						<ContextMenuItem onClick={handleComment}>
							Add Comment
						</ContextMenuItem>
					</ContextMenuGroup>

					<ContextMenuSeparator />

					<ContextMenuGroup>
						<ContextMenuItem onClick={handleMoveUp}>Move Up</ContextMenuItem>
						<ContextMenuItem onClick={handleMoveDown}>
							Move Down
						</ContextMenuItem>
					</ContextMenuGroup>

					<ContextMenuSeparator />

					<ContextMenuGroup>
						<ContextMenuSub>
							<ContextMenuSubTrigger>Turn into</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-48">
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.p)}>
									Paragraph
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.h1)}>
									Heading 1
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.h2)}>
									Heading 2
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.h3)}>
									Heading 3
								</ContextMenuItem>
								<ContextMenuItem
									onClick={() => handleTurnInto(KEYS.blockquote)}
								>
									Blockquote
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.codeBlock)}>
									Code Block
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.callout)}>
									Callout
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleTurnInto(KEYS.toggle)}>
									Toggle
								</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
						<ContextMenuSub>
							<ContextMenuSubTrigger>Align</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-48">
								<ContextMenuItem onClick={() => handleAlign("left")}>
									Left
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleAlign("center")}>
									Center
								</ContextMenuItem>
								<ContextMenuItem onClick={() => handleAlign("right")}>
									Right
								</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
					</ContextMenuGroup>

					<ContextMenuSeparator />

					<ContextMenuGroup>
						<ContextMenuItem
							onClick={() =>
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.setIndent(1)
							}
						>
							Indent
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() =>
								editor
									.getTransforms(BlockSelectionPlugin)
									.blockSelection.setIndent(-1)
							}
						>
							Outdent
						</ContextMenuItem>
					</ContextMenuGroup>
				</ContextMenuContent>
			)}
		</ContextMenu>
	);
}
