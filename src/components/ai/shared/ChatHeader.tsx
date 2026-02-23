"use client";

// ── Types ────────────────────────────────────────────────────────────────

export type ChatHeaderProps = {
	/** Header title — defaults to "CLAVE AI" */
	title?: string;
	/** Subtitle shown below the title (e.g. active thread name) */
	subtitle?: string;
	/** Optional context chip rendered below the title row */
	contextChip?: React.ReactNode;
	/** Action buttons rendered on the right side of the header */
	actions?: React.ReactNode;
	/** Optional left-side action (e.g. SidebarTrigger on full-page views) */
	leftAction?: React.ReactNode;
	/** Additional className for the header container */
	className?: string;
	/** Optional children rendered inline after the title (e.g. badge) */
	children?: React.ReactNode;
};

// ── ChatHeader ───────────────────────────────────────────────────────────

export function ChatHeader({
	title = "CLAVE AI",
	subtitle,
	contextChip,
	actions,
	leftAction,
	className,
	children,
}: ChatHeaderProps) {
	return (
		<div className={className}>
			<div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
				<div className="flex items-center gap-2 min-w-0">
					{leftAction}
					<div className="flex flex-col min-w-0">
						<div className="flex items-center">
							<span className="text-sm font-semibold tracking-tight">
								{title}
							</span>
							{children}
						</div>
						{subtitle && (
							<span className="truncate text-xs text-muted-foreground leading-tight">
								{subtitle}
							</span>
						)}
					</div>
				</div>
				{actions && <div className="flex items-center gap-1">{actions}</div>}
			</div>
			{contextChip}
		</div>
	);
}
