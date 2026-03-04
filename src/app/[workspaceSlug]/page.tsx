import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function WorkspaceRootPage({
	params,
}: {
	params: Promise<{ workspaceSlug: string }>;
}) {
	const { workspaceSlug } = await params;
	redirect(`/${workspaceSlug}/chat` as Route);
}
