import { PublicWhiteboardView } from "./PublicWhiteboardView";

export default async function ShareBoardPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <PublicWhiteboardView token={token} />;
}
