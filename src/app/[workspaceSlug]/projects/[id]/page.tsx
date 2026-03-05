import { ProjectDetailsPage } from "@/components/projects/ProjectDetailsPage";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
	const { id } = await params;
	return <ProjectDetailsPage slug={id} />;
}
