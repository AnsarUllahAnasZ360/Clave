"use client";

import { Suspense } from "react";
import { MarketplaceSetup } from "@/components/google-chat/MarketplaceSetup";

export default function GoogleChatSetupPage() {
	return (
		<Suspense
			fallback={
				<div className="text-sm text-neutral-400">Loading...</div>
			}
		>
			<MarketplaceSetup />
		</Suspense>
	);
}
