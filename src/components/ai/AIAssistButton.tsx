"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const aiAssistButtonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all select-none outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 touch-manipulation",
	{
		variants: {
			variant: {
				icon: "size-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-md text-sienna-500 hover:bg-sienna-500/10 hover:text-sienna-600 focus-visible:ring-1 focus-visible:ring-sienna-400/50 dark:text-sienna-400 dark:hover:bg-sienna-400/10 dark:hover:text-sienna-300",
				button:
					"h-8 min-h-[44px] sm:min-h-0 rounded-md px-3 text-sm bg-sienna-500 text-white hover:bg-sienna-600 focus-visible:ring-2 focus-visible:ring-sienna-400/50 focus-visible:ring-offset-1 dark:bg-sienna-600 dark:hover:bg-sienna-500",
				inline:
					"h-6 min-h-[44px] sm:min-h-0 rounded-full px-2.5 text-xs bg-sienna-500/10 text-sienna-600 hover:bg-sienna-500/20 hover:text-sienna-700 focus-visible:ring-1 focus-visible:ring-sienna-400/50 dark:bg-sienna-400/10 dark:text-sienna-400 dark:hover:bg-sienna-400/20 dark:hover:text-sienna-300",
			},
		},
		defaultVariants: {
			variant: "icon",
		},
	},
);

type AIAssistButtonVariant = VariantProps<typeof aiAssistButtonVariants>;

interface AIAssistButtonProps
	extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
		AIAssistButtonVariant {
	/** Custom label — defaults to "AI Assist" for `button` variant. */
	label?: string;
	/** Show a loading spinner instead of the sparkle icon. */
	loading?: boolean;
}

const AIAssistButton = forwardRef<HTMLButtonElement, AIAssistButtonProps>(
	(
		{ className, variant = "icon", label, loading = false, disabled, ...props },
		ref,
	) => {
		const iconSize = variant === "inline" ? 12 : 16;
		const displayLabel =
			label ?? (variant === "button" ? "AI Assist" : undefined);

		return (
			<button
				ref={ref}
				type="button"
				disabled={disabled || loading}
				className={cn(aiAssistButtonVariants({ variant }), className)}
				aria-label={displayLabel ?? "AI Assist"}
				{...props}
			>
				{loading ? (
					<Loader2Icon size={iconSize} className="animate-spin" />
				) : (
					<SparklesIcon size={iconSize} />
				)}
				{displayLabel && <span>{displayLabel}</span>}
			</button>
		);
	},
);

AIAssistButton.displayName = "AIAssistButton";

export { AIAssistButton, aiAssistButtonVariants };
export type { AIAssistButtonProps };
