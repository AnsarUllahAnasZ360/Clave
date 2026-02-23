"use client";

/**
 * Lightweight Plate plugin that enables AI features in editors.
 *
 * Editors that include this plugin in their plugin list will show
 * AI slash menu items (filtered by `has("ai-editor")` in slash-node.tsx)
 * and can mount the EditorAIBridge for selection toolbar + event handling.
 */

import { createPlatePlugin } from "platejs/react";

export const AIEditorPlugin = createPlatePlugin({
	key: "ai-editor",
});
