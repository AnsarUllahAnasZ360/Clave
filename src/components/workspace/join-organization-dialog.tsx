"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";
import {
	PlanLimitDialog,
	type PlanLimitInfo,
} from "@/components/billing/PlanLimitDialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../../convex/_generated/api";

export function JoinOrganizationDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const joinWithCode = useMutation(api.organizationMembers.joinWithCode);
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [planLimitInfo, setPlanLimitInfo] = useState<PlanLimitInfo | null>(
		null,
	);

	// Validate in real-time
	const validation = useQuery(
		api.organizationInviteCodes.validate,
		code.length >= 6 ? { code: code.toUpperCase() } : "skip",
	);

	const handleCodeChange = useCallback((value: string) => {
		// Only allow alphanumeric, auto-uppercase
		setCode(
			value
				.replace(/[^a-zA-Z0-9]/g, "")
				.toUpperCase()
				.slice(0, 8),
		);
		setError("");
	}, []);

	const handleJoin = async () => {
		if (!code.trim()) {
			setError("Invite code is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await joinWithCode({ code: code.trim() });
			onOpenChange(false);
			setCode("");
			// Reload to pick up the new org context
			window.location.reload();
		} catch (e) {
			if (
				e instanceof ConvexError &&
				typeof e.data === "object" &&
				e.data !== null &&
				"kind" in e.data &&
				e.data.kind === "plan_limit"
			) {
				setPlanLimitInfo(e.data as PlanLimitInfo);
			} else {
				setError(
					e instanceof Error ? e.message : "Failed to join organization",
				);
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Join organization</DialogTitle>
						<DialogDescription>
							Enter an invite code to join an existing organization.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="org-invite-code">Invite code</Label>
							<Input
								id="org-invite-code"
								placeholder="ABC123"
								value={code}
								onChange={(e) => handleCodeChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleJoin();
								}}
								className="font-mono text-center text-lg tracking-widest"
								maxLength={8}
							/>
						</div>

						{validation?.valid && (
							<div className="rounded-lg border border-border bg-muted/50 p-3">
								<p className="text-sm text-muted-foreground">You will join:</p>
								<p className="text-sm font-medium">{validation.orgName}</p>
							</div>
						)}

						{validation && !validation.valid && code.length >= 6 && (
							<p className="text-sm text-destructive">
								Invalid or expired invite code
							</p>
						)}

						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={loading}
						>
							Cancel
						</Button>
						<Button
							onClick={handleJoin}
							disabled={
								loading ||
								!code.trim() ||
								(validation ? !validation.valid : true)
							}
						>
							{loading ? "Joining..." : "Join organization"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<PlanLimitDialog
				open={!!planLimitInfo}
				onClose={() => setPlanLimitInfo(null)}
				limitInfo={planLimitInfo}
			/>
		</>
	);
}
