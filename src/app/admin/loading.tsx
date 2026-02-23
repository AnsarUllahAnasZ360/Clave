import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="p-6 space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, i) => (
					<Skeleton key={i} className="h-24 w-full rounded-lg" />
				))}
			</div>

			<Skeleton className="h-64 w-full rounded-lg" />
		</div>
	);
}
