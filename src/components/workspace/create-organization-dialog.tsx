"use client";

import { useMutation } from "convex/react";
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

function generateSlugFromName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function CreateOrganizationDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const createOrganization = useMutation(api.organizations.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
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

	const handleSlugChange = useCallback((value: string) => {
		setSlug(generateSlugFromName(value));
		setSlugEdited(true);
		setError("");
	}, []);

	const handleCreate = async () => {
		if (!name.trim()) {
			setError("Organization name is required");
			return;
		}
		if (!slug.trim()) {
			setError("Organization URL is required");
			return;
		}

		setLoading(true);
		setError("");

		try {
			await createOrganization({
				name: name.trim(),
				slug: slug.trim(),
			});
			onOpenChange(false);
			setName("");
			setSlug("");
			setSlugEdited(false);
			// Reload to pick up the new org context
			window.location.reload();
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to create organization",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create organization</DialogTitle>
					<DialogDescription>
						Organizations group your team's workspaces together.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="org-name">Name</Label>
						<Input
							id="org-name"
							placeholder="My organization"
							value={name}
							onChange={(e) => handleNameChange(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreate();
							}}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="org-slug">URL slug</Label>
						<Input
							id="org-slug"
							placeholder="my-organization"
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
						{loading ? "Creating..." : "Create organization"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
