"use client";

import dynamic from "next/dynamic";
import { DocumentEditorSkeleton } from "./DocumentEditor";

const editorImport = () => import("./DocumentEditor");

const DocumentEditor = dynamic(editorImport, {
	ssr: false,
	loading: () => <DocumentEditorSkeleton />,
});

/** Eagerly trigger the editor bundle download before the component renders. */
export function preloadDocumentEditor() {
	void editorImport();
}

export { DocumentEditor as DocumentEditorDynamic };
