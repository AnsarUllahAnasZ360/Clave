import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="relative flex h-full min-h-0 w-full flex-col bg-background">
			<div className="sticky top-0 z-10 border-b border-border bg-background p-4">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex min-w-0 items-center gap-2">
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-5 w-40" />
					</div>
					<Skeleton className="h-8 w-20 rounded-md" />
				</div>
				<Skeleton className="h-7 w-2/3" />
			</div>
			<div className="flex-1 space-y-4 p-4">
				<div className="grid gap-2">
					<div className="grid grid-cols-[40px_1fr] gap-2">
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-16 w-full" />
					</div>
					<div className="grid grid-cols-[40px_1fr] gap-2">
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-14 w-3/4" />
					</div>
				</div>
				<div className="sticky bottom-4 rounded-lg border border-dashed border-border bg-card/50 p-3">
					<Skeleton className="h-11 w-full rounded-md" />
				</div>
			</div>
		</div>
	);
}
