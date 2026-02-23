"use client";

import { Robot } from "@phosphor-icons/react/dist/ssr";
import { CircleDot, FileText, X } from "lucide-react";
import { memo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { MentionEntityType } from "@/hooks/use-mention-search";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export type MentionChipProps = {
	entityType: MentionEntityType;
	displayName: string;
	/** Avatar image URL (users only) */
	image?: string;
	/** Issue identifier like "AUTH-42" */
	subtitle?: string;
	/** Called when the × button is clicked to remove this chip */
	onRemove?: () => void;
	/** Additional className */
	className?: string;
};

// ── Color map ────────────────────────────────────────────────────────────

const CHIP_STYLES: Record<
	MentionEntityType,
	{ bg: string; text: string; border: string }
> = {
	user: {
		bg: "bg-emerald-50 dark:bg-emerald-950/40",
		text: "text-emerald-700 dark:text-emerald-300",
		border: "border-emerald-200/60 dark:border-emerald-800/50",
	},
	issue: {
		bg: "bg-blue-50 dark:bg-blue-950/40",
		text: "text-blue-700 dark:text-blue-300",
		border: "border-blue-200/60 dark:border-blue-800/50",
	},
	document: {
		bg: "bg-purple-50 dark:bg-purple-950/40",
		text: "text-purple-700 dark:text-purple-300",
		border: "border-purple-200/60 dark:border-purple-800/50",
	},
	agent: {
		bg: "bg-teal-50 dark:bg-teal-950/40",
		text: "text-teal-700 dark:text-teal-300",
		border: "border-teal-200/60 dark:border-teal-800/50",
	},
};

// ── MentionChip ──────────────────────────────────────────────────────────

export const MentionChip = memo(function MentionChip({
	entityType,
	displayName,
	image,
	subtitle,
	onRemove,
	className,
}: MentionChipProps) {
	const styles = CHIP_STYLES[entityType];

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
				styles.bg,
				styles.text,
				styles.border,
				className,
			)}
		>
			{/* Icon / Avatar */}
			{entityType === "user" && (
				<Avatar size="sm" className="size-3.5">
					{image && <AvatarImage src={image} alt={displayName} />}
					<AvatarFallback className="text-[8px]">
						{displayName.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			)}
			{entityType === "issue" && <CircleDot className="size-3 shrink-0" />}
			{entityType === "document" && <FileText className="size-3 shrink-0" />}
			{entityType === "agent" && <Robot className="size-3 shrink-0" />}

			{/* Display text */}
			<span className="max-w-[120px] truncate">
				{subtitle ? `${subtitle} ${displayName}` : displayName}
			</span>

			{/* Remove button */}
			{onRemove && (
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onRemove();
					}}
					className={cn(
						"ml-0.5 rounded-sm opacity-60 transition-opacity hover:opacity-100",
						styles.text,
					)}
					aria-label={`Remove mention of ${displayName}`}
				>
					<X className="size-3" />
				</button>
			)}
		</span>
	);
});
