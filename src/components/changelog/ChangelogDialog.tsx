"use client";

import { useQuery } from "convex/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "../../../convex/_generated/api";

type ChangelogDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
	const versions = useQuery(api.versions.list);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>Changelog</DialogTitle>
					<DialogDescription>See what's new in Clave.</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto space-y-6 pr-2">
					{versions === undefined ? (
						<div className="space-y-4">
							{[1, 2].map((i) => (
								<div key={i} className="animate-pulse space-y-2">
									<div className="h-5 w-32 bg-muted rounded" />
									<div className="h-3 w-24 bg-muted rounded" />
									<div className="h-3 w-full bg-muted rounded" />
									<div className="h-3 w-3/4 bg-muted rounded" />
								</div>
							))}
						</div>
					) : versions.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No versions recorded yet.
						</p>
					) : (
						versions.map((version) => (
							<div key={version._id} className="space-y-2">
								<div className="flex items-baseline gap-2">
									<h3 className="text-base font-semibold">
										v{version.version}
									</h3>
									<span className="text-xs text-muted-foreground">
										{version.title}
									</span>
								</div>
								<p className="text-xs text-muted-foreground">
									{formatDate(version.releasedAt)}
								</p>

								{version.features.length > 0 && (
									<div>
										<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
											Features
										</h4>
										<ul className="space-y-1">
											{version.features.map((feature) => (
												<li
													key={feature}
													className="text-sm text-foreground flex gap-2"
												>
													<span className="text-emerald-500 mt-0.5 shrink-0">
														+
													</span>
													{feature}
												</li>
											))}
										</ul>
									</div>
								)}

								{version.bugFixes.length > 0 && (
									<div>
										<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
											Bug Fixes
										</h4>
										<ul className="space-y-1">
											{version.bugFixes.map((fix) => (
												<li
													key={fix}
													className="text-sm text-foreground flex gap-2"
												>
													<span className="text-blue-500 mt-0.5 shrink-0">
														~
													</span>
													{fix}
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						))
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
