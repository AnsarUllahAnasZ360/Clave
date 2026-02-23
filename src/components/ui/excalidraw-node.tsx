"use client";

import type { TExcalidrawElement } from "@platejs/excalidraw";
import type { TExcalidrawProps } from "@platejs/excalidraw/react";
import { useExcalidrawElement } from "@platejs/excalidraw/react";
import type { PlateElementProps } from "platejs/react";
import { PlateElement, useReadOnly } from "platejs/react";
import React from "react";

import "@excalidraw/excalidraw/index.css";

/**
 * Excalidraw appState fields that are transient runtime data (Map/Set types)
 * and must not be persisted. They fail JSON serialization through Yjs/Convex
 * and cause TypeError on reload (e.g. collaborators.forEach is not a function).
 */
const TRANSIENT_APP_STATE_KEYS = ["collaborators", "followedBy"] as const;

type OnChangeFn = NonNullable<TExcalidrawProps["onChange"]>;
type AppStateParam = Parameters<OnChangeFn>[1];

export function ExcalidrawElement(
	props: PlateElementProps<TExcalidrawElement>,
) {
	const { children, element } = props;
	const readOnly = useReadOnly();

	const { Excalidraw, excalidrawProps } = useExcalidrawElement({
		element,
	});

	// Wrap onChange to strip transient Map/Set fields before saving to Slate node.
	// Without this, collaborators (a Map) gets cloneDeep'd into a plain object,
	// serialized through Yjs/JSON, and crashes on reload.
	const originalOnChange = excalidrawProps.onChange;
	const wrappedOnChange = React.useCallback(
		(
			elements: Parameters<OnChangeFn>[0],
			appState: AppStateParam,
			files: Parameters<OnChangeFn>[2],
		) => {
			if (!originalOnChange) return;
			const sanitizedState = { ...appState };
			for (const key of TRANSIENT_APP_STATE_KEYS) {
				delete (sanitizedState as Partial<AppStateParam>)[key];
			}
			originalOnChange(elements, sanitizedState as AppStateParam, files);
		},
		[originalOnChange],
	);

	// Reconstruct collaborators as an empty Map on load for backward compatibility.
	// Documents already saved with collaborators as a plain object {} would crash
	// Excalidraw which expects Map.forEach() to exist.
	const sanitizedInitialData = React.useMemo(() => {
		const data = excalidrawProps.initialData;
		if (!data || data instanceof Promise || !data.appState) return data;
		return {
			...data,
			appState: {
				...data.appState,
				collaborators: new Map(),
				followedBy: new Set(),
			},
		};
	}, [excalidrawProps]);

	return (
		<PlateElement {...props}>
			<div contentEditable={false}>
				<div className="mx-auto aspect-video h-[600px] w-[min(100%,600px)] overflow-hidden rounded-sm border">
					{Excalidraw && (
						<Excalidraw
							{...excalidrawProps}
							onChange={wrappedOnChange}
							initialData={sanitizedInitialData}
							viewModeEnabled={readOnly}
						/>
					)}
				</div>
			</div>
			{children}
		</PlateElement>
	);
}
