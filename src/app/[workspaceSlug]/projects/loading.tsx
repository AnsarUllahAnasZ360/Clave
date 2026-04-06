import { Skeleton } from "@/components/ui/skeleton";
import { SKELETON_KEYS_6 } from "@/lib/skeleton-placeholders";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col p-6 gap-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-8 w-28" />
			</div>
			<Skeleton className="h-px w-full" />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{SKELETON_KEYS_6.map((key) => (
					<Skeleton key={key} className="h-40 w-full rounded-lg" />
				))}
			</div>
		</div>
	);
}
