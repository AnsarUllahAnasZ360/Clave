import { ListDetailPage } from "@/components/lists/ListDetailPage";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

type PageProps = {
	params: Promise<{ listId: string }>;
};

export default async function Page({ params }: PageProps) {
	const { listId } = await params;
	return <ListDetailPage listId={listId as Id<"lists">} />;
}
