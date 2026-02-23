import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col p-6 gap-4">
			<Skeleton className="h-8 w-40" />
			<div className="flex gap-2">
				<Skeleton className="h-8 w-20" />
				<Skeleton className="h-8 w-20" />
				<Skeleton className="h-8 w-20" />
			</div>
			<Skeleton className="h-px w-full" />
			<div className="space-y-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={`notif-${i}`} className="flex items-start gap-3 p-3">
						<Skeleton className="h-8 w-8 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
