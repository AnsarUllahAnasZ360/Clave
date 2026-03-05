import { ClientDetailsPage } from "@/components/clients/ClientDetailsPage";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
	const { id } = await params;
	return <ClientDetailsPage clientId={id} />;
}
