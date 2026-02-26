import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PaneTitle({
	className,
	children,
	...props
}: React.ComponentProps<"h2">) {
	return (
		<h2
			className={cn("text-lg leading-none font-semibold", className)}
			{...props}
		>
			{children}
		</h2>
	);
}

export function PaneDescription({
	className,
	children,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)} {...props}>
			{children}
		</p>
	);
}

export function SettingSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-4">
			<div className="text-sm font-semibold text-foreground">{title}</div>
			<div className="space-y-5">{children}</div>
		</section>
	);
}

export function SettingRow({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)] sm:items-center sm:gap-6">
			<div className="space-y-1">
				<div className="text-sm font-medium text-foreground">{label}</div>
				{description && (
					<p className="text-xs text-muted-foreground leading-relaxed">
						{description}
					</p>
				)}
			</div>
			<div className="flex flex-col gap-2 text-sm text-foreground">
				{children}
			</div>
		</div>
	);
}
