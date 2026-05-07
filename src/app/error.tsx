"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalRouteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Surface errors in dev consoles + production telemetry. Keeping this
		// at the boundary level means a single misbehaving query doesn't take
		// the whole tree down silently.
		console.error("Route error boundary caught:", error);
	}, [error]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="font-mono text-xs uppercase tracking-[0.18em] text-sienna-500">
					Error
				</p>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Something went wrong
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					We hit an unexpected error rendering this page. The team has been
					notified — try again or head home.
				</p>
				{error.digest ? (
					<p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
						Reference: {error.digest}
					</p>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<Button onClick={() => reset()} variant="default" size="sm">
					Try again
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link href={"/" as Route}>Go home</Link>
				</Button>
			</div>
		</div>
	);
}
