import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col p-6 gap-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-36" />
				<Skeleton className="h-8 w-24" />
			</div>
			<div className="flex gap-2">
				<Skeleton className="h-8 w-20" />
				<Skeleton className="h-8 w-20" />
			</div>
			<Skeleton className="h-px w-full" />
			<div className="space-y-2">
				{Array.from({ length: 8 }).map((_, i) => (
					<Skeleton key={`task-${i}`} className="h-10 w-full" />
				))}
			</div>
		</div>
	);
}
