"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../../convex/_generated/api";
import { WorkspaceDiscoveryPanel } from "./WorkspaceDiscoveryPanel";

export function JoinOrDiscoverDialog({
	open,
	onOpenChange,
	onJoined,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onJoined?: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Join a workspace</DialogTitle>
					<DialogDescription>
						Discover public workspaces or enter an invite code to join.
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="discover" className="w-full">
					<TabsList className="w-full">
						<TabsTrigger value="discover" className="flex-1">
							Discover
						</TabsTrigger>
						<TabsTrigger value="invite-code" className="flex-1">
							Invite Code
						</TabsTrigger>
					</TabsList>

					<TabsContent value="discover" className="mt-4">
						<WorkspaceDiscoveryPanel />
					</TabsContent>

					<TabsContent value="invite-code" className="mt-4">
						<InviteCodeTab
							redirectOnJoin={!onJoined}
							onJoined={() => {
								onOpenChange(false);
								onJoined?.();
							}}
						/>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}

function InviteCodeTab({
	onJoined,
	redirectOnJoin = true,
}: {
	onJoined: () => void;
	redirectOnJoin?: boolean;
}) {
	const joinWithCode = useMutation(api.workspaceMembers.joinWithCode);
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const validation = useQuery(
		api.inviteCodes.validate,
		code.length >= 6 ? { code: code.toUpperCase() } : "skip",
	);

	const handleCodeChange = useCallback((value: string) => {
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
			onJoined();
			setCode("");
			if (redirectOnJoin) {
				window.location.href = "/";
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to join workspace");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="grid gap-2">
				<Label htmlFor="invite-code-tab">Invite code</Label>
				<Input
					id="invite-code-tab"
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

			<div className="flex justify-end gap-2">
				<Button
					onClick={handleJoin}
					disabled={
						loading || !code.trim() || (validation ? !validation.valid : true)
					}
				>
					{loading ? "Joining..." : "Join workspace"}
				</Button>
			</div>
		</div>
	);
}
