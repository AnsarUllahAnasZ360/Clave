import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<header className="flex items-center gap-3 border-b border-border px-4 py-3">
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-5 w-20" />
			</header>

			<div className="flex-1 p-6 space-y-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-px w-full" />
				<Skeleton className="h-32 w-full rounded-lg" />
				<Skeleton className="h-48 w-full rounded-lg" />
			</div>
		</div>
	);
}
