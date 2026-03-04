import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background min-w-0">
			<div className="flex items-center gap-3 border-b border-border px-4 py-2">
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-5 w-40" />
				<div className="ml-auto flex gap-2">
					<Skeleton className="h-8 w-8" />
					<Skeleton className="h-8 w-8" />
				</div>
			</div>

			<div className="flex-1 p-4">
				<Skeleton className="h-full w-full rounded-lg" />
			</div>
		</div>
	);
}
