"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../../../convex/_generated/api";

function generateSlugFromName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export default function OnboardingPage() {
	const router = useRouter();
	const user = useQuery(api.users.current);
	const workspaces = useQuery(api.workspaces.list);
	const createWorkspace = useMutation(api.workspaces.create);
	const joinWithCode = useMutation(api.workspaceMembers.joinWithCode);

	const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleNameChange = useCallback(
		(value: string) => {
			setName(value);
			if (!slugEdited) {
				setSlug(generateSlugFromName(value));
			}
			setError("");
		},
		[slugEdited],
	);

	// If user already has workspaces, redirect to first one
	useEffect(() => {
		if (workspaces && workspaces.length > 0) {
			router.replace(`/${workspaces[0].slug}/projects`);
		}
	}, [workspaces, router]);

	const handleCreate = async () => {
		if (!name.trim()) {
			setError("Workspace name is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await createWorkspace({
				name: name.trim(),
				slug: slug.trim() || undefined,
			});
			router.push(
				`/${slug.trim() || generateSlugFromName(name.trim())}/projects`,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create workspace");
		} finally {
			setLoading(false);
		}
	};

	const handleJoin = async () => {
		if (!code.trim()) {
			setError("Invite code is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await joinWithCode({ code: code.trim() });
			// Reload to pick up the new workspace
			window.location.href = "/";
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to join workspace");
		} finally {
			setLoading(false);
		}
	};

	// Still loading user/workspaces data, or redirecting
	if (
		user === undefined ||
		workspaces === undefined ||
		(workspaces && workspaces.length > 0)
	) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-md space-y-8 px-4">
				<div className="text-center">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-800 text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
						<span className="text-lg font-bold">C</span>
					</div>
					<h1 className="mt-6 text-2xl font-semibold tracking-tight">
						Welcome to Clave
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{user?.name
							? `Hey ${user.name}, let's get you set up.`
							: "Let's get you set up with a workspace."}
					</p>
				</div>

				{mode === "choose" && (
					<div className="space-y-3">
						<Button className="w-full h-12" onClick={() => setMode("create")}>
							Create a new workspace
						</Button>
						<Button
							variant="outline"
							className="w-full h-12"
							onClick={() => setMode("join")}
						>
							Join with invite code
						</Button>
					</div>
				)}

				{mode === "create" && (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="ws-name">Workspace name</Label>
							<Input
								id="ws-name"
								placeholder="Acme Inc."
								value={name}
								onChange={(e) => handleNameChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreate();
								}}
								autoFocus
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="ws-slug">URL</Label>
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground whitespace-nowrap">
									goclave.app/
								</span>
								<Input
									id="ws-slug"
									placeholder="acme-inc"
									value={slug}
									onChange={(e) => {
										setSlug(generateSlugFromName(e.target.value));
										setSlugEdited(true);
										setError("");
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleCreate();
									}}
								/>
							</div>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<div className="flex gap-3">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => {
									setMode("choose");
									setError("");
								}}
								disabled={loading}
							>
								Back
							</Button>
							<Button
								className="flex-1"
								onClick={handleCreate}
								disabled={loading || !name.trim()}
							>
								{loading ? "Creating..." : "Create workspace"}
							</Button>
						</div>
					</div>
				)}

				{mode === "join" && (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="invite-code">Invite code</Label>
							<Input
								id="invite-code"
								placeholder="ABC123"
								value={code}
								onChange={(e) => {
									setCode(
										e.target.value
											.replace(/[^a-zA-Z0-9]/g, "")
											.toUpperCase()
											.slice(0, 8),
									);
									setError("");
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleJoin();
								}}
								className="font-mono text-center text-lg tracking-widest"
								maxLength={8}
								autoFocus
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<div className="flex gap-3">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => {
									setMode("choose");
									setError("");
								}}
								disabled={loading}
							>
								Back
							</Button>
							<Button
								className="flex-1"
								onClick={handleJoin}
								disabled={loading || !code.trim()}
							>
								{loading ? "Joining..." : "Join workspace"}
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
