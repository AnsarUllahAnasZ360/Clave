import Mention from "@tiptap/extension-mention";

/**
 * Extended mention extension that stores entityType (user, document, whiteboard)
 * alongside the standard id and label attributes.
 */
export const CustomMention = Mention.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			entityType: {
				default: "user",
				parseHTML: (element: HTMLElement) =>
					element.getAttribute("data-entity-type") ?? "user",
				renderHTML: (attributes: Record<string, string>) => ({
					"data-entity-type": attributes.entityType,
				}),
			},
		};
	},
});
