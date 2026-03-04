export default function BacklogPage() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center justify-between border-b border-border px-6 py-4">
				<h1 className="text-lg font-semibold">Backlog</h1>
			</div>
			<div className="flex-1 p-6">
				<p className="text-sm text-muted-foreground">
					Project backlog will be loaded here.
				</p>
			</div>
		</div>
	);
}
