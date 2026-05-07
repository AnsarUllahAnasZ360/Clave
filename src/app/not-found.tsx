import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="font-mono text-xs uppercase tracking-[0.18em] text-sienna-500">
					404
				</p>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Page not found
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					The page you&apos;re looking for doesn&apos;t exist or has moved.
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button asChild variant="default" size="sm">
					<Link href={"/" as Route}>Go home</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link href={"/sign-in" as Route}>Sign in</Link>
				</Button>
			</div>
		</div>
	);
}
