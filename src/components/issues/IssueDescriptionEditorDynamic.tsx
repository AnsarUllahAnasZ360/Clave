"use client";

import dynamic from "next/dynamic";
import { IssueDescriptionEditorSkeleton } from "./IssueDescriptionEditor";

const IssueDescriptionEditor = dynamic(
	() => import("./IssueDescriptionEditor"),
	{
		ssr: false,
		loading: () => <IssueDescriptionEditorSkeleton />,
	},
);

export { IssueDescriptionEditor as IssueDescriptionEditorDynamic };
