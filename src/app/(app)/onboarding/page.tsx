"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

function generateSlugFromName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

type Step = "org-choose" | "org-create" | "org-join" | "ws-create";

export default function OnboardingPage() {
	const router = useRouter();
	const user = useQuery(api.users.current);
	const organizations = useQuery(api.organizations.list);
	const workspaces = useQuery(api.workspaces.list);

	const createOrg = useMutation(api.organizations.create);
	const createWorkspace = useMutation(api.workspaces.create);
	const joinOrgWithCode = useMutation(api.organizationMembers.joinWithCode);

	const [step, setStep] = useState<Step>("org-choose");

	// Org create state
	const [orgName, setOrgName] = useState("");
	const [orgSlug, setOrgSlug] = useState("");
	const [orgSlugEdited, setOrgSlugEdited] = useState(false);

	// Workspace create state
	const [wsName, setWsName] = useState("");
	const [wsSlug, setWsSlug] = useState("");
	const [wsSlugEdited, setWsSlugEdited] = useState(false);
	const [wsVisibility, setWsVisibility] = useState<"public" | "private">(
		"public",
	);

	// Join org state
	const [joinCode, setJoinCode] = useState("");

	// Real-time org invite code validation
	const codeValidation = useQuery(
		api.organizationInviteCodes.validate,
		joinCode.length >= 6 ? { code: joinCode } : "skip",
	);

	// Shared state
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Track the org created/selected during this flow
	const [createdOrgId, setCreatedOrgId] = useState<Id<"organizations"> | null>(
		null,
	);
	const [createdOrgSlug, setCreatedOrgSlug] = useState<string>("");

	// Redirect logic: if user already has orgs + workspaces, leave onboarding
	useEffect(() => {
		if (
			organizations === undefined ||
			workspaces === undefined ||
			user === undefined
		) {
			return;
		}

		if (organizations.length > 0 && workspaces.length > 0) {
			// Try exact match first
			const matchedOrg = workspaces[0].organizationId
				? organizations.find(
						(o: { _id: string }) => o._id === workspaces[0].organizationId,
					)
				: null;

			if (matchedOrg) {
				router.replace(`/${matchedOrg.slug}/${workspaces[0].slug}/projects`);
				return;
			}

			// Fallback: workspace not linked to an org — use first org
			router.replace(
				`/${organizations[0].slug}/${workspaces[0].slug}/projects`,
			);
			return;
		}

		// User has orgs but no workspaces — skip to workspace creation
		if (organizations.length > 0 && workspaces.length === 0 && !createdOrgId) {
			setCreatedOrgId(organizations[0]._id);
			setCreatedOrgSlug(organizations[0].slug);
			setStep("ws-create");
		}
	}, [organizations, workspaces, user, router, createdOrgId]);

	const handleOrgNameChange = useCallback(
		(value: string) => {
			setOrgName(value);
			if (!orgSlugEdited) {
				setOrgSlug(generateSlugFromName(value));
			}
			setError("");
		},
		[orgSlugEdited],
	);

	const handleWsNameChange = useCallback(
		(value: string) => {
			setWsName(value);
			if (!wsSlugEdited) {
				setWsSlug(generateSlugFromName(value));
			}
			setError("");
		},
		[wsSlugEdited],
	);

	const handleCreateOrg = async () => {
		if (!orgName.trim()) {
			setError("Organization name is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			const orgId = await createOrg({
				name: orgName.trim(),
				slug: orgSlug.trim() || undefined,
			});
			setCreatedOrgId(orgId);
			setCreatedOrgSlug(orgSlug.trim() || generateSlugFromName(orgName.trim()));
			setStep("ws-create");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to create organization",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleCreateWorkspace = async () => {
		if (!wsName.trim()) {
			setError("Workspace name is required");
			return;
		}
		if (!createdOrgId) {
			setError("Organization is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await createWorkspace({
				name: wsName.trim(),
				slug: wsSlug.trim() || undefined,
				organizationId: createdOrgId,
				visibility: wsVisibility,
			});
			const finalSlug = wsSlug.trim() || generateSlugFromName(wsName.trim());
			router.push(`/${createdOrgSlug}/${finalSlug}/projects`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create workspace");
		} finally {
			setLoading(false);
		}
	};

	const handleJoinOrg = async () => {
		if (!joinCode.trim()) {
			setError("Invite code is required");
			return;
		}

		if (!codeValidation?.valid) {
			setError("Invalid invite code");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await joinOrgWithCode({ code: joinCode.trim() });
			// Reload to pick up the new org + its workspaces
			window.location.href = "/";
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to join organization");
		} finally {
			setLoading(false);
		}
	};

	// Loading state — show while queries are loading or redirect is in progress
	const isRedirecting =
		organizations &&
		organizations.length > 0 &&
		workspaces &&
		workspaces.length > 0;

	if (
		user === undefined ||
		organizations === undefined ||
		workspaces === undefined ||
		isRedirecting
	) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	const greeting = user?.name
		? `Hey ${user.name}, let's get you set up.`
		: "Let's get you set up.";

	const stepSubtitle: Record<Step, string> = {
		"org-choose": greeting,
		"org-create": "Create your organization to get started.",
		"org-join": "Enter an invite code to join an existing organization.",
		"ws-create": "Create your first workspace to start collaborating.",
	};

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
						{stepSubtitle[step]}
					</p>
				</div>

				{/* Step 1: Choose create or join org */}
				{step === "org-choose" && (
					<div className="space-y-3">
						<Button
							className="w-full h-12"
							onClick={() => {
								setStep("org-create");
								setError("");
							}}
						>
							Create an organization
						</Button>
						<Button
							variant="outline"
							className="w-full h-12"
							onClick={() => {
								setStep("org-join");
								setError("");
							}}
						>
							Join an organization
						</Button>
					</div>
				)}

				{/* Step 2a: Create organization */}
				{step === "org-create" && (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="org-name">Organization name</Label>
							<Input
								id="org-name"
								placeholder="Acme Inc."
								value={orgName}
								onChange={(e) => handleOrgNameChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreateOrg();
								}}
								autoFocus
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="org-slug">URL slug</Label>
							<Input
								id="org-slug"
								placeholder="acme-inc"
								value={orgSlug}
								onChange={(e) => {
									setOrgSlug(generateSlugFromName(e.target.value));
									setOrgSlugEdited(true);
									setError("");
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreateOrg();
								}}
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<div className="flex gap-3">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => {
									setStep("org-choose");
									setError("");
								}}
								disabled={loading}
							>
								Back
							</Button>
							<Button
								className="flex-1"
								onClick={handleCreateOrg}
								disabled={loading || !orgName.trim()}
							>
								{loading ? "Creating..." : "Create organization"}
							</Button>
						</div>
					</div>
				)}

				{/* Step 2b: Join organization with invite code */}
				{step === "org-join" && (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="invite-code">Invite code</Label>
							<Input
								id="invite-code"
								placeholder="ABC123"
								value={joinCode}
								onChange={(e) => {
									setJoinCode(
										e.target.value
											.replace(/[^a-zA-Z0-9]/g, "")
											.toUpperCase()
											.slice(0, 8),
									);
									setError("");
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleJoinOrg();
								}}
								className="font-mono text-center text-lg tracking-widest"
								maxLength={8}
								autoFocus
							/>
						</div>
						{/* Real-time validation feedback */}
						{joinCode.length >= 6 && codeValidation && (
							<div className="text-sm">
								{codeValidation.valid ? (
									<p className="text-green-600 dark:text-green-400">
										Organization: {codeValidation.orgName}
									</p>
								) : (
									<p className="text-destructive">
										Invalid or expired invite code
									</p>
								)}
							</div>
						)}
						{error && <p className="text-sm text-destructive">{error}</p>}
						<div className="flex gap-3">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => {
									setStep("org-choose");
									setError("");
									setJoinCode("");
								}}
								disabled={loading}
							>
								Back
							</Button>
							<Button
								className="flex-1"
								onClick={handleJoinOrg}
								disabled={loading || !joinCode.trim() || !codeValidation?.valid}
							>
								{loading ? "Joining..." : "Join organization"}
							</Button>
						</div>
					</div>
				)}

				{/* Step 3: Create workspace (after org created or if user has org but no workspaces) */}
				{step === "ws-create" && (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="ws-name">Workspace name</Label>
							<Input
								id="ws-name"
								placeholder="Engineering"
								value={wsName}
								onChange={(e) => handleWsNameChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreateWorkspace();
								}}
								autoFocus
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="ws-slug">URL slug</Label>
							<Input
								id="ws-slug"
								placeholder="engineering"
								value={wsSlug}
								onChange={(e) => {
									setWsSlug(generateSlugFromName(e.target.value));
									setWsSlugEdited(true);
									setError("");
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreateWorkspace();
								}}
							/>
						</div>
						<div className="grid gap-2">
							<Label>Visibility</Label>
							<div className="flex gap-2">
								<Button
									type="button"
									variant={wsVisibility === "public" ? "default" : "outline"}
									className="flex-1"
									onClick={() => setWsVisibility("public")}
								>
									Public
								</Button>
								<Button
									type="button"
									variant={wsVisibility === "private" ? "default" : "outline"}
									className="flex-1"
									onClick={() => setWsVisibility("private")}
								>
									Private
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								{wsVisibility === "public"
									? "All organization members can see and join this workspace."
									: "Only invited members can access this workspace."}
							</p>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<div className="flex gap-3">
							{/* Only show Back if we came from org-create (not if user already had an org) */}
							{organizations && organizations.length === 0 && (
								<Button
									variant="outline"
									className="flex-1"
									onClick={() => {
										setStep("org-choose");
										setError("");
									}}
									disabled={loading}
								>
									Back
								</Button>
							)}
							<Button
								className="flex-1"
								onClick={handleCreateWorkspace}
								disabled={loading || !wsName.trim()}
							>
								{loading ? "Creating..." : "Create workspace"}
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
