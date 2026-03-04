import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center justify-between border-b border-border px-6 py-4">
				<Skeleton className="h-6 w-24" />
				<Skeleton className="h-8 w-28" />
			</div>

			<div className="p-4 space-y-2">
				{Array.from({ length: 6 }, (_, i) => (
					<div key={i} className="flex items-center gap-3 p-3">
						<Skeleton className="h-10 w-10 rounded-full shrink-0" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-24" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
