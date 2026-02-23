"use client";

import { TooltipProvider } from "@/components/ui/tooltip";

export function ShareLayoutClient({ children }: { children: React.ReactNode }) {
	return (
		<TooltipProvider>
			<div className="flex h-screen flex-col overflow-hidden bg-background">
				{children}
			</div>
		</TooltipProvider>
	);
}
