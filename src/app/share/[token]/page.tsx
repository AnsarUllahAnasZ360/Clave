import { PublicDocumentView } from "./PublicDocumentView";

export default async function SharePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <PublicDocumentView token={token} />;
}
