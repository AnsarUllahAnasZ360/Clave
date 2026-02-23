"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";

type BackButtonProps = {
	/** URL to navigate to if there is no browser history (e.g. direct page load in new tab) */
	fallbackHref?: string;
};

export function BackButton({ fallbackHref }: BackButtonProps) {
	const router = useRouter();

	const handleBack = useCallback(() => {
		if (window.history.length > 1) {
			router.back();
		} else if (fallbackHref) {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic route from prop
			router.push(fallbackHref as any);
		} else {
			router.back();
		}
	}, [router, fallbackHref]);

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			onClick={handleBack}
			aria-label="Go back"
		>
			<ArrowLeft className="h-4 w-4" />
		</Button>
	);
}
