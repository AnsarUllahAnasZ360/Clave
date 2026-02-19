"use client";

import dynamic from "next/dynamic";
import { NoteBlockNoteEditorSkeleton } from "./BlockNoteEditor";

const NoteBlockNoteEditor = dynamic(() => import("./BlockNoteEditor"), {
	ssr: false,
	loading: () => <NoteBlockNoteEditorSkeleton />,
});

export { NoteBlockNoteEditor as NoteBlockNoteEditorDynamic };
