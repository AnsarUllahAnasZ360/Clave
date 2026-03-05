import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<header className="flex items-center gap-3 border-b border-border px-4 py-3">
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-8 w-8" />
				<Skeleton className="h-5 w-20" />
			</header>

			<div className="flex flex-1 min-h-0">
				<aside className="w-64 shrink-0 border-r border-border/60 bg-muted/40 px-4 py-4 space-y-4">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-4 w-24 mt-4" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
				</aside>

				<main className="flex-1 min-h-0 px-6 py-6 space-y-4">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-px w-full" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-32 w-full" />
				</main>
			</div>
		</div>
	);
}
