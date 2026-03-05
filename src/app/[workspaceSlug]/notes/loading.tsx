import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col p-6 gap-4">
			<Skeleton className="h-8 w-32" />
			<Skeleton className="h-px w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}
