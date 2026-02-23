import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="p-6">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-40" />
				</div>

				<div className="mt-4">
					<Skeleton className="h-8 w-[360px]" />
					<Skeleton className="mt-3 h-5 w-[520px]" />
					<Skeleton className="mt-5 h-px w-full" />
				</div>

				<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
					<div className="space-y-6">
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-24 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>

					<div className="space-y-4">
						<Skeleton className="h-6 w-24" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
