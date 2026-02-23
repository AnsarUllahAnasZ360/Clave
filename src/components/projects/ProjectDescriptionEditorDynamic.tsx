"use client";

import dynamic from "next/dynamic";
import { ProjectDescriptionEditorSkeleton } from "./ProjectDescriptionEditor";

const ProjectDescriptionEditor = dynamic(
	() => import("./ProjectDescriptionEditor"),
	{
		ssr: false,
		loading: () => <ProjectDescriptionEditorSkeleton />,
	},
);

export { ProjectDescriptionEditor as ProjectDescriptionEditorDynamic };
