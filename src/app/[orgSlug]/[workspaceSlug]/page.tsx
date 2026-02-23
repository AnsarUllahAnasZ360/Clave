import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function WorkspaceRootPage({
	params,
}: {
	params: Promise<{ orgSlug: string; workspaceSlug: string }>;
}) {
	const { orgSlug, workspaceSlug } = await params;
	redirect(`/${orgSlug}/${workspaceSlug}/chat` as Route);
}
