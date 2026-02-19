"use client";

import dynamic from "next/dynamic";
import { DocumentEditorSkeleton } from "./DocumentEditor";

const DocumentEditor = dynamic(() => import("./DocumentEditor"), {
	ssr: false,
	loading: () => <DocumentEditorSkeleton />,
});

export { DocumentEditor as DocumentEditorDynamic };
