"use client";

import dynamic from "next/dynamic";
import { WhiteboardEditorSkeleton } from "./WhiteboardEditor";

const WhiteboardEditor = dynamic(() => import("./WhiteboardEditor"), {
	ssr: false,
	loading: () => <WhiteboardEditorSkeleton />,
});

export { WhiteboardEditor as WhiteboardEditorDynamic };
