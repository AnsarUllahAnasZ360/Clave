import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center gap-3 border-b border-border px-6 py-3">
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-5 w-48" />
			</div>

			<div className="mx-auto w-full max-w-3xl p-8 space-y-4">
				<Skeleton className="h-10 w-3/4" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-5/6" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="mt-6 h-4 w-2/3" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="mt-6 h-32 w-full" />
			</div>
		</div>
	);
}
