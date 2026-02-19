"use client";

import dynamic from "next/dynamic";

const DocumentReadOnly = dynamic(
	() =>
		import("@/components/documents/DocumentReadOnly").then(
			(m) => m.DocumentReadOnly,
		),
	{
		ssr: false,
		loading: () => (
			<div className="flex flex-col gap-3 py-4">
				<div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
				<div className="h-4 w-full animate-pulse rounded bg-muted" />
				<div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
				<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
			</div>
		),
	},
);

export { DocumentReadOnly as DocumentReadOnlyDynamic };
