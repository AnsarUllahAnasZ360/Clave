import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center gap-3 border-b border-border px-6 py-3">
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-5 w-40" />
			</div>

			<div className="p-6 space-y-6">
				<div className="flex items-center gap-4">
					<Skeleton className="h-16 w-16 rounded-full" />
					<div className="space-y-2">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-4 w-32" />
					</div>
				</div>

				<Skeleton className="h-px w-full" />

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-32 w-full" />
				</div>
			</div>
		</div>
	);
}
