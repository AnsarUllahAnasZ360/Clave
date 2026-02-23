import { DocumentEditorPage } from "@/components/documents/DocumentEditorPage";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
	const { id } = await params;
	return <DocumentEditorPage documentId={id} />;
}
