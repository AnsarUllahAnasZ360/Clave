"use client";

import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";

const convex = new ConvexReactClient(
	process.env.NEXT_PUBLIC_CONVEX_URL as string,
);

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function ChangelogContent() {
	const versions = useQuery(api.versions.list);

	return (
		<div className="mx-auto max-w-2xl px-6 py-16">
			<header className="mb-12">
				<Link
					href="/"
					className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
				>
					&larr; Back to Clave
				</Link>
				<h1 className="mt-4 text-3xl font-bold tracking-tight text-neutral-50">
					Changelog
				</h1>
				<p className="mt-2 text-neutral-400">
					New features, improvements, and fixes.
				</p>
			</header>

			<div className="space-y-12">
				{versions === undefined ? (
					<div className="space-y-8">
						{[1, 2, 3].map((i) => (
							<div key={i} className="animate-pulse space-y-3">
								<div className="h-6 w-40 rounded bg-neutral-800" />
								<div className="h-4 w-28 rounded bg-neutral-800" />
								<div className="h-4 w-full rounded bg-neutral-800" />
								<div className="h-4 w-3/4 rounded bg-neutral-800" />
							</div>
						))}
					</div>
				) : versions.length === 0 ? (
					<p className="text-sm text-neutral-500">No versions recorded yet.</p>
				) : (
					versions.map((version, index) => (
						<article
							key={version._id}
							className="relative pl-8 border-l border-neutral-800"
						>
							<div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-neutral-800 bg-neutral-950" />
							{index === 0 && (
								<div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-sienna-500 bg-sienna-500/20" />
							)}

							<div className="flex items-baseline gap-3">
								<span className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-0.5 text-sm font-mono font-semibold text-neutral-100">
									v{version.version}
								</span>
								<span className="text-sm text-neutral-400">
									{version.title}
								</span>
							</div>

							<p className="mt-1 text-xs text-neutral-500">
								{formatDate(version.releasedAt)}
							</p>

							{version.features.length > 0 && (
								<div className="mt-4">
									<h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
										Features
									</h3>
									<ul className="space-y-1.5">
										{version.features.map((feature) => (
											<li
												key={feature}
												className="text-sm text-neutral-300 flex gap-2"
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
								<div className="mt-4">
									<h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
										Bug fixes
									</h3>
									<ul className="space-y-1.5">
										{version.bugFixes.map((fix) => (
											<li
												key={fix}
												className="text-sm text-neutral-300 flex gap-2"
											>
												<span className="text-blue-500 mt-0.5 shrink-0">~</span>
												{fix}
											</li>
										))}
									</ul>
								</div>
							)}
						</article>
					))
				)}
			</div>

			<footer className="mt-16 pt-8 border-t border-neutral-800 text-center">
				<p className="text-xs text-neutral-500">
					{new Date().getFullYear()} Clave. Built in sync.
				</p>
			</footer>
		</div>
	);
}

export default function ChangelogPage() {
	return (
		<ConvexProvider client={convex}>
			<div className="min-h-screen bg-neutral-950 text-neutral-50">
				<ChangelogContent />
			</div>
		</ConvexProvider>
	);
}
