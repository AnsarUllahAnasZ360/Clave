"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { getConvexUrl, validateRequiredEnv } from "@/lib/env";

// Validate before constructing the client so a missing NEXT_PUBLIC_CONVEX_URL
// surfaces as a clear boot-time error instead of an opaque "queries hang"
// runtime symptom.
validateRequiredEnv();

const convex = new ConvexReactClient(getConvexUrl());

export function ConvexProvider({ children }: { children: ReactNode }) {
	return (
		<ConvexAuthNextjsProvider client={convex}>
			{children}
		</ConvexAuthNextjsProvider>
	);
}
