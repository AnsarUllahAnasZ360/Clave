import { Skeleton } from "@/components/ui/skeleton";
import { SKELETON_KEYS_4 } from "@/lib/skeleton-placeholders";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col p-6 gap-6">
			<Skeleton className="h-8 w-44" />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{SKELETON_KEYS_4.map((key) => (
					<Skeleton key={key} className="h-24 w-full rounded-lg" />
				))}
			</div>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<Skeleton className="h-64 w-full rounded-lg" />
				<Skeleton className="h-64 w-full rounded-lg" />
			</div>
		</div>
	);
}
