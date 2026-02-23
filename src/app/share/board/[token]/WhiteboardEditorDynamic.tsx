"use client";

import dynamic from "next/dynamic";

const WhiteboardEditor = dynamic(
	() => import("@/components/whiteboards/WhiteboardEditor"),
	{
		ssr: false,
		loading: () => (
			<div className="flex h-full w-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-sienna-9" />
					<p className="text-sm text-muted-foreground">Loading whiteboard...</p>
				</div>
			</div>
		),
	},
);

export { WhiteboardEditor as WhiteboardEditorDynamic };
