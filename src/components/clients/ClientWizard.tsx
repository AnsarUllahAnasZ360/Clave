"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ClientStatus =
	| "prospect"
	| "active"
	| "on_hold"
	| "completed"
	| "archived";

interface ClientWizardProps {
	mode: "create" | "edit";
	initialClient?: {
		_id: Id<"clients">;
		name: string;
		status: ClientStatus;
		industry?: string;
		website?: string;
		location?: string;
		notes?: string;
		primaryContactName?: string;
		primaryContactEmail?: string;
	};
	onClose: () => void;
}

export function ClientWizard({
	mode,
	initialClient,
	onClose,
}: ClientWizardProps) {
	const { workspaceId } = useWorkspace();
	const [name, setName] = useState(initialClient?.name ?? "");
	const [status, setStatus] = useState<ClientStatus>(
		initialClient?.status ?? "active",
	);
	const [primaryContactName, setPrimaryContactName] = useState(
		initialClient?.primaryContactName ?? "",
	);
	const [primaryContactEmail, setPrimaryContactEmail] = useState(
		initialClient?.primaryContactEmail ?? "",
	);
	const [industry, setIndustry] = useState(initialClient?.industry ?? "");
	const [website, setWebsite] = useState(initialClient?.website ?? "");
	const [location, setLocation] = useState(initialClient?.location ?? "");
	const [notes, setNotes] = useState(initialClient?.notes ?? "");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const createMutation = useMutation(api.clients.create);
	const updateMutation = useMutation(api.clients.update);

	const isEdit = mode === "edit";

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Client name is required");
			return;
		}

		setIsSubmitting(true);
		try {
			if (isEdit && initialClient?._id) {
				await updateMutation({
					clientId: initialClient._id,
					name: name.trim(),
					status,
					industry: industry.trim() || undefined,
					website: website.trim() || undefined,
					location: location.trim() || undefined,
					notes: notes.trim() || undefined,
				});
				toast.success("Client updated");
			} else {
				await createMutation({
					workspaceId,
					name: name.trim(),
					status,
					industry: industry.trim() || undefined,
					website: website.trim() || undefined,
					location: location.trim() || undefined,
					notes: notes.trim() || undefined,
					primaryContactName: primaryContactName.trim() || undefined,
					primaryContactEmail: primaryContactEmail.trim() || undefined,
				});
				toast.success("Client created");
			}
			onClose();
		} catch {
			toast.error(
				isEdit ? "Failed to update client" : "Failed to create client",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.2, ease: "easeInOut" }}
				className="flex w-full max-w-xl flex-col overflow-hidden rounded-[24px] bg-background shadow-2xl border border-border"
			>
				<div className="flex items-start justify-between px-6 pt-5 pb-4">
					<div>
						<p className="text-base font-semibold text-foreground">
							{isEdit ? "Edit client" : "New client"}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Basic information about the client, primary contact and context.
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 rounded-full"
						onClick={onClose}
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				<div className="flex-1 overflow-y-auto px-6 pb-6 pt-3 space-y-5">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Client name
							</Label>
							<Input
								value={name}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setName(e.target.value)
								}
								placeholder="e.g. Acme Corp"
								className="h-9 text-sm"
							/>
						</div>

						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Status
							</Label>
							<Select
								value={status}
								onValueChange={(v) => setStatus(v as ClientStatus)}
							>
								<SelectTrigger className="h-9 text-sm">
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="prospect">Prospect</SelectItem>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="on_hold">On hold</SelectItem>
									<SelectItem value="archived">Archived</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Primary contact name
							</Label>
							<Input
								value={primaryContactName}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setPrimaryContactName(e.target.value)
								}
								placeholder="e.g. Sarah Lee"
								className="h-9 text-sm"
							/>
						</div>

						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Primary contact email
							</Label>
							<Input
								type="email"
								value={primaryContactEmail}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setPrimaryContactEmail(e.target.value)
								}
								placeholder="name@company.com"
								className="h-9 text-sm"
							/>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Industry
							</Label>
							<Input
								value={industry}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setIndustry(e.target.value)
								}
								placeholder="Fintech, Healthcare..."
								className="h-9 text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Location
							</Label>
							<Input
								value={location}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setLocation(e.target.value)
								}
								placeholder="City, Country"
								className="h-9 text-sm"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label className="text-xs font-medium text-muted-foreground">
							Website
						</Label>
						<Input
							value={website}
							onChange={(e: ChangeEvent<HTMLInputElement>) =>
								setWebsite(e.target.value)
							}
							placeholder="https://"
							className="h-9 text-sm"
						/>
					</div>

					<div className="space-y-1.5">
						<Label className="text-xs font-medium text-muted-foreground">
							Notes
						</Label>
						<Textarea
							value={notes}
							onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
								setNotes(e.target.value)
							}
							placeholder="Context about this client, expectations, or important details."
							className="min-h-24 text-sm"
						/>
					</div>
				</div>

				<div className="flex items-center justify-between border-t border-border/60 bg-background px-6 py-4">
					<Button variant="outline" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button size="sm" onClick={handleSave} disabled={isSubmitting}>
						{isEdit ? "Save changes" : "Create client"}
					</Button>
				</div>
			</motion.div>
		</div>
	);
}
