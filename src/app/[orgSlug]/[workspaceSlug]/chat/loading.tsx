import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="relative flex h-full min-h-0 w-full flex-col bg-background">
			<div className="sticky top-0 z-10 border-b border-border bg-background p-4">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex min-w-0 items-center gap-2">
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-5 w-36" />
					</div>
					<Skeleton className="h-8 w-20 rounded-md" />
				</div>
				<div className="flex flex-wrap gap-2">
					<Skeleton className="h-8 w-20 rounded-full" />
					<Skeleton className="h-8 w-20 rounded-full" />
					<Skeleton className="h-8 w-20 rounded-full" />
				</div>
			</div>
			<div className="flex-1 space-y-4 p-4">
				<div className="space-y-2">
					<Skeleton className="h-4 w-52" />
					<Skeleton className="h-28 w-full" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-44" />
					<Skeleton className="h-24 w-full" />
				</div>
				<div className="mt-4 grid gap-2">
					<Skeleton className="h-10 w-full rounded-lg" />
					<Skeleton className="h-10 w-full rounded-lg" />
				</div>
			</div>
		</div>
	);
}
