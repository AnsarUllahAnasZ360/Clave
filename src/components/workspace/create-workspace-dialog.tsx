"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
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
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const createWorkspace = useMutation(api.workspaces.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
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
			});
			onOpenChange(false);
			toast.success(`Workspace "${name.trim()}" created`);
			setName("");
			setSlug("");
			setSlugEdited(false);
			router.push(`/${slug.trim()}/chat`);
		} catch (e) {
			if (
				e instanceof ConvexError &&
				typeof e.data === "object" &&
				e.data !== null &&
				"kind" in e.data &&
				e.data.kind === "plan_limit"
			) {
				setPlanLimitInfo(e.data as PlanLimitInfo);
			} else if (e instanceof ConvexError) {
				const msg =
					typeof e.data === "string" ? e.data : "Failed to create workspace";
				setError(msg);
			} else if (
				e instanceof Error &&
				e.message.includes("slug already exists")
			) {
				setError(
					"A workspace with this URL already exists. Please choose a different name.",
				);
			} else {
				setError("Failed to create workspace");
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
