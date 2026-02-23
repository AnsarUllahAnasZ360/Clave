"use client";

import { createPlatePlugin } from "platejs/react";

import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { SimpleFloatingToolbarButtons } from "@/components/ui/simple-floating-toolbar-buttons";

export const SimpleFloatingToolbarKit = [
	createPlatePlugin({
		key: "floating-toolbar",
		render: {
			afterEditable: () => (
				<FloatingToolbar>
					<SimpleFloatingToolbarButtons />
				</FloatingToolbar>
			),
		},
	}),
];
