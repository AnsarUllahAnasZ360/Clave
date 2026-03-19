import { SprintDetailPage } from "@/components/projects/SprintDetailPage";

type PageProps = {
	params: Promise<{ id: string; sprintId: string }>;
};

export default async function Page({ params }: PageProps) {
	const { id, sprintId } = await params;
	return <SprintDetailPage projectSlug={id} sprintId={sprintId} />;
}
