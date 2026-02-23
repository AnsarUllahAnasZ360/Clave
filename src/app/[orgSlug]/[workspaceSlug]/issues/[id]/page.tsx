import { IssueDetailPage } from "@/components/issues/IssueDetailPage";

export default async function IssueDetailRoute({
	params,
}: {
	params: Promise<{ orgSlug: string; workspaceSlug: string; id: string }>;
}) {
	const { id } = await params;
	return <IssueDetailPage identifier={id} />;
}
