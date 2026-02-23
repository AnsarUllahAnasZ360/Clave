import { WhiteboardEditorPage } from "@/components/whiteboards/WhiteboardEditorPage";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
	const { id } = await params;
	return <WhiteboardEditorPage whiteboardId={id} />;
}
