import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center justify-between border-b border-border px-6 py-4">
				<Skeleton className="h-6 w-20" />
			</div>

			<div className="p-6 space-y-4">
				<Skeleton className="h-4 w-64" />
			</div>
		</div>
	);
}
