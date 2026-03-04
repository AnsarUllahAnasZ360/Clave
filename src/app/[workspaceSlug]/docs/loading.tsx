import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col p-6 gap-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-8 w-28" />
			</div>
			<Skeleton className="h-px w-full" />
			<div className="space-y-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={`doc-${i}`} className="flex items-center gap-3 p-3">
						<Skeleton className="h-5 w-5" />
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-3 w-24" />
					</div>
				))}
			</div>
		</div>
	);
}
