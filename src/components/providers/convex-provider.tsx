"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { type ReactNode, useMemo } from "react";
import { getConvexUrl, validateRequiredEnv } from "@/lib/env";

// Lazy-construct the client on first render so the env validation throws
// inside React's render tree (catchable by an error boundary, surfaces a
// clean error UI) instead of at module-evaluation time — which on the
// client just produced a white screen during dev when Turbopack compiled
// the bundle before `.env.local` was loaded.
let convexClient: ConvexReactClient | null = null;
function getConvexClient(): ConvexReactClient {
	if (convexClient) return convexClient;
	validateRequiredEnv();
	convexClient = new ConvexReactClient(getConvexUrl());
	return convexClient;
}

export function ConvexProvider({ children }: { children: ReactNode }) {
	const client = useMemo(() => getConvexClient(), []);
	return (
		<ConvexAuthNextjsProvider client={client}>
			{children}
		</ConvexAuthNextjsProvider>
	);
}
