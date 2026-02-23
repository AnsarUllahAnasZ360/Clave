"use client";

import { Check, ShieldAlert, X } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalCardProps = {
	description: string;
	status: ApprovalStatus;
	resultMessage?: string;
	onApprove: () => Promise<void>;
	onReject: () => Promise<void>;
};

// ── ApprovalCard ─────────────────────────────────────────────────────────

export const ApprovalCard = memo(function ApprovalCard({
	description,
	status,
	resultMessage,
	onApprove,
	onReject,
}: ApprovalCardProps) {
	const [isApproving, setIsApproving] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);

	const handleApprove = useCallback(async () => {
		setIsApproving(true);
		try {
			await onApprove();
		} finally {
			setIsApproving(false);
		}
	}, [onApprove]);

	const handleReject = useCallback(async () => {
		setIsRejecting(true);
		try {
			await onReject();
		} finally {
			setIsRejecting(false);
		}
	}, [onReject]);

	const isActing = isApproving || isRejecting;

	// ── Approved state ──────────────────────────────────────────────────
	if (status === "approved") {
		return (
			<div className="my-1.5 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/30">
				<div className="flex items-center gap-2">
					<Badge
						variant="secondary"
						className="border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
					>
						<Check className="size-3" />
						Approved
					</Badge>
					<span className="text-xs text-muted-foreground">{description}</span>
				</div>
				{resultMessage && (
					<p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
						{resultMessage}
					</p>
				)}
			</div>
		);
	}

	// ── Rejected state ──────────────────────────────────────────────────
	if (status === "rejected") {
		return (
			<div className="my-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
				<div className="flex items-center gap-2">
					<Badge
						variant="secondary"
						className="border-destructive/30 bg-destructive/10 text-destructive"
					>
						<X className="size-3" />
						Rejected
					</Badge>
					<span className="text-xs text-muted-foreground">{description}</span>
				</div>
				{resultMessage && (
					<p className="mt-1.5 text-xs text-destructive/70">{resultMessage}</p>
				)}
			</div>
		);
	}

	// ── Pending state (interactive) ─────────────────────────────────────
	return (
		<div className="my-1.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
			<div className="flex items-start gap-2.5 px-3 py-2.5">
				<ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<div>
						<p className="text-xs font-medium text-foreground">
							Approval required
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{description}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="default"
							onClick={handleApprove}
							disabled={isActing}
							className={cn(
								"h-7 gap-1.5 px-3 text-xs",
								"bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700",
							)}
						>
							<Check className="size-3" />
							{isApproving ? "Approving..." : "Approve"}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={handleReject}
							disabled={isActing}
							className="h-7 gap-1.5 border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
						>
							<X className="size-3" />
							{isRejecting ? "Rejecting..." : "Reject"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
});
