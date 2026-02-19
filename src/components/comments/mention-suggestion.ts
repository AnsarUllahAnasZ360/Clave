import type { SuggestionOptions } from "@tiptap/suggestion";
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import type { MentionItem, MentionListRef } from "./MentionList";
import { MentionList } from "./MentionList";

export type MentionSuggestionOptions = {
	fetchItems: (query: string) => Promise<MentionItem[]>;
};

export function createMentionSuggestion({
	fetchItems,
}: MentionSuggestionOptions): Omit<SuggestionOptions<MentionItem>, "editor"> {
	return {
		char: "@",
		allowSpaces: false,
		items: async ({ query }) => {
			return fetchItems(query);
		},
		command: ({ editor, range, props }) => {
			const item = props as unknown as MentionItem;
			const label = item.type === "user" ? item.data.name : item.data.title;
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "mention",
					attrs: {
						id: item.data.id,
						label,
						entityType: item.type,
					},
				})
				.insertContent(" ")
				.run();
		},
		render: () => {
			// Container and root are scoped to each render() lifecycle.
			// They are reused across onStart/onExit cycles within a single
			// suggestion session to prevent flicker from destroy/recreate.
			let container: HTMLElement | null = null;
			let root: ReturnType<typeof createRoot> | null = null;
			const listRef = createRef<MentionListRef>();
			let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

			function ensureContainer() {
				if (cleanupTimer) {
					clearTimeout(cleanupTimer);
					cleanupTimer = null;
				}
				if (!container) {
					container = document.createElement("div");
					container.style.position = "fixed";
					container.style.zIndex = "9999";
					container.style.pointerEvents = "auto";
					document.body.appendChild(container);
				}
				if (!root) {
					root = createRoot(container);
				}
				container.style.display = "";
				return { container, root };
			}

			function positionContainer(
				rect: DOMRect | null | undefined,
				el: HTMLElement,
			) {
				if (!rect) return;
				const top = rect.bottom + 4;
				const left = rect.left;
				const viewportHeight = window.innerHeight;

				// Always position below cursor first
				el.style.top = `${top}px`;
				el.style.left = `${left}px`;

				// After the content renders, check if we need to flip above
				requestAnimationFrame(() => {
					const dropdownHeight = el.offsetHeight;
					if (
						dropdownHeight > 0 &&
						top + dropdownHeight > viewportHeight &&
						rect.top - dropdownHeight - 4 > 0
					) {
						el.style.top = `${rect.top - dropdownHeight - 4}px`;
					}
				});
			}

			function cleanup() {
				root?.unmount();
				container?.remove();
				container = null;
				root = null;
			}

			return {
				onStart(props) {
					const { container: el, root: r } = ensureContainer();

					positionContainer(props.clientRect?.(), el);

					r.render(
						createElement(MentionList, {
							ref: listRef,
							items: props.items as MentionItem[],
							command: (item: MentionItem) => {
								props.command(item as never);
							},
						}),
					);
				},

				onUpdate(props) {
					if (container) {
						positionContainer(props.clientRect?.(), container);
					}

					root?.render(
						createElement(MentionList, {
							ref: listRef,
							items: props.items as MentionItem[],
							command: (item: MentionItem) => {
								props.command(item as never);
							},
						}),
					);
				},

				onKeyDown({ event }) {
					if (event.key === "Escape") {
						return true;
					}
					return listRef.current?.onKeyDown(event) ?? false;
				},

				onExit() {
					// Hide the container instead of destroying it immediately.
					// If onStart is called again quickly (e.g., boundary typing),
					// we reuse the existing container to avoid flicker.
					if (container) {
						container.style.display = "none";
					}
					root?.render(null);

					// Schedule cleanup after a delay. If onStart fires before
					// the timer, it cancels cleanup and reuses the container.
					cleanupTimer = setTimeout(cleanup, 500);
				},
			};
		},
	};
}
