"use client";

import { X } from "@phosphor-icons/react";
import { useAIChatPanel } from "@/components/ai/ai-chat-context";
import { PixelCIcon } from "@/components/ui/pixel-c-icon";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

function AIChatPanelContent({ onClose }: { onClose: () => void }) {
	return (
		<div className="flex h-full w-[400px] flex-col border-l border-border/40 bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
				<div className="flex items-center gap-2">
					<PixelCIcon size={16} color="var(--color-sienna-500)" />
					<span className="text-sm font-semibold">AI assistant</span>
				</div>
				<div className="flex items-center gap-1">
					<kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
						<span className="text-xs">&#8984;</span>J
					</kbd>
					<button
						type="button"
						onClick={onClose}
						className="ml-1 flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
						aria-label="Close AI assistant"
					>
						<X className="size-4" />
					</button>
				</div>
			</div>

			{/* Body — empty state */}
			<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sienna-500/10">
					<PixelCIcon size={32} color="var(--color-sienna-500)" />
				</div>
				<div className="space-y-2">
					<h3 className="text-base font-semibold">AI assistant coming soon</h3>
					<p className="text-sm text-muted-foreground leading-relaxed">
						In the next update, you will be able to chat with an AI teammate
						that understands your projects, tasks, and workflow.
					</p>
				</div>
			</div>

			{/* Input area (visual only) */}
			<div className="border-t border-border/40 px-4 py-3">
				<div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 opacity-60">
					<span className="text-sm text-muted-foreground">
						Ask your AI teammate...
					</span>
				</div>
			</div>
		</div>
	);
}

export function AIChatSidebar() {
	const { isOpen, close } = useAIChatPanel();
	const isMobile = useIsMobile();

	// Mobile: render as sheet
	if (isMobile) {
		return (
			<Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
				<SheetContent side="right" className="w-full p-0 sm:max-w-[400px]">
					<SheetHeader className="sr-only">
						<SheetTitle>AI Assistant</SheetTitle>
						<SheetDescription>AI chat panel</SheetDescription>
					</SheetHeader>
					<AIChatPanelContent onClose={close} />
				</SheetContent>
			</Sheet>
		);
	}

	// Desktop: push panel
	return (
		<div
			className={cn(
				"flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
				isOpen ? "w-[400px]" : "w-0",
			)}
		>
			<AIChatPanelContent onClose={close} />
		</div>
	);
}
