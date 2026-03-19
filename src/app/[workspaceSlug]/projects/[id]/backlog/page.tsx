import { BacklogPage } from "@/components/projects/BacklogPage";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
	const { id } = await params;
	return <BacklogPage projectSlug={id} />;
}
