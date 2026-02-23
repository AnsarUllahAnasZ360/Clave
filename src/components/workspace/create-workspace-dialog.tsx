"use client";

import { Globe, Lock } from "@phosphor-icons/react/dist/ssr";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
	PlanLimitDialog,
	type PlanLimitInfo,
} from "@/components/billing/PlanLimitDialog";
import { useOrganization } from "@/components/providers/organization-context";
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
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function generateSlugFromName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
	organizationId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: Id<"organizations">;
}) {
	const router = useRouter();
	const { orgSlug } = useOrganization();
	const createWorkspace = useMutation(api.workspaces.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [visibility, setVisibility] = useState<"public" | "private">("public");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [planLimitInfo, setPlanLimitInfo] = useState<PlanLimitInfo | null>(
		null,
	);

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

	const handleSlugChange = useCallback((value: string) => {
		setSlug(generateSlugFromName(value));
		setSlugEdited(true);
		setError("");
	}, []);

	const handleCreate = async () => {
		if (!name.trim()) {
			setError("Workspace name is required");
			return;
		}
		if (!slug.trim()) {
			setError("Workspace URL is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await createWorkspace({
				name: name.trim(),
				slug: slug.trim(),
				organizationId,
				visibility,
			});
			onOpenChange(false);
			setName("");
			setSlug("");
			setSlugEdited(false);
			setVisibility("public");
			router.push(`/${orgSlug}/${slug.trim()}/projects`);
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
				setError(e instanceof Error ? e.message : "Failed to create workspace");
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
						<DialogTitle>Create workspace</DialogTitle>
						<DialogDescription>
							Workspaces are shared environments where your team collaborates on
							projects.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="workspace-name">Name</Label>
							<Input
								id="workspace-name"
								placeholder="My workspace"
								value={name}
								onChange={(e) => handleNameChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreate();
								}}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="workspace-slug">URL slug</Label>
							<Input
								id="workspace-slug"
								placeholder="my-workspace"
								value={slug}
								onChange={(e) => handleSlugChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreate();
								}}
							/>
						</div>
						<div className="grid gap-2">
							<Label>Visibility</Label>
							<div className="grid grid-cols-2 gap-2">
								<button
									type="button"
									onClick={() => setVisibility("public")}
									className={cn(
										"flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer",
										visibility === "public"
											? "border-primary bg-primary/5 text-foreground"
											: "border-border text-muted-foreground hover:bg-accent",
									)}
								>
									<Globe className="h-4 w-4" />
									Public
								</button>
								<button
									type="button"
									onClick={() => setVisibility("private")}
									className={cn(
										"flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer",
										visibility === "private"
											? "border-primary bg-primary/5 text-foreground"
											: "border-border text-muted-foreground hover:bg-accent",
									)}
								>
									<Lock className="h-4 w-4" />
									Private
								</button>
							</div>
							<p className="text-xs text-muted-foreground">
								{visibility === "public"
									? "Anyone in the organization can discover and join this workspace."
									: "Only invited members can access this workspace."}
							</p>
						</div>
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
						<Button onClick={handleCreate} disabled={loading || !name.trim()}>
							{loading ? "Creating..." : "Create workspace"}
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
