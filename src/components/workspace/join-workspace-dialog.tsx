"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
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

export function JoinWorkspaceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const joinWithCode = useMutation(api.workspaceMembers.joinWithCode);
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Validate in real-time
	const validation = useQuery(
		api.inviteCodes.validate,
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
			// Get the workspace slug to navigate
			onOpenChange(false);
			setCode("");
			// We need to reload to get the workspace data
			window.location.href = "/";
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to join workspace");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Join workspace</DialogTitle>
					<DialogDescription>
						Enter an invite code to join an existing workspace.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="invite-code">Invite code</Label>
						<Input
							id="invite-code"
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
							<p className="text-sm font-medium">{validation.workspaceName}</p>
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
							loading || !code.trim() || (validation ? !validation.valid : true)
						}
					>
						{loading ? "Joining..." : "Join workspace"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
