"use client";

import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ClientStatusBadge } from "@/components/clients/ClientStatusBadge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ClientStatus =
	| "prospect"
	| "active"
	| "on_hold"
	| "completed"
	| "archived";

interface ClientStatusFilterPopoverProps {
	initialStatus: ClientStatus;
	clientId?: Id<"clients">;
}

const STATUS_ITEMS: { value: ClientStatus; label: string }[] = [
	{ value: "on_hold", label: "On hold" },
	{ value: "prospect", label: "Prospect" },
	{ value: "active", label: "Active" },
	{ value: "completed", label: "Completed" },
	{ value: "archived", label: "Archived" },
];

export function ClientStatusFilterPopover({
	initialStatus,
	clientId,
}: ClientStatusFilterPopoverProps) {
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<ClientStatus>(initialStatus);
	const updateStatusMutation = useMutation(api.clients.updateStatus);

	const handleStatusChange = async (newStatus: ClientStatus) => {
		setStatus(newStatus);
		setOpen(false);

		if (clientId) {
			try {
				await updateStatusMutation({ clientId, status: newStatus });
			} catch {
				setStatus(status);
				toast.error("Failed to update status");
			}
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground cursor-pointer transition-colors hover:bg-muted sm:w-auto sm:justify-start sm:gap-8"
				>
					<span className="text-xs text-muted-foreground">Stage</span>
					<span className="inline-flex items-center gap-2 rounded-full p-0 text-xs font-medium text-foreground">
						<ClientStatusBadge status={status} />
						<CaretDown className="h-3 w-3 text-muted-foreground" />
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="w-64 rounded-xl p-2"
			>
				<div className="space-y-1.5">
					{STATUS_ITEMS.map((item) => {
						const isActive = item.value === status;
						return (
							<button
								key={item.value}
								type="button"
								onClick={() => handleStatusChange(item.value)}
								className={cn(
									"flex w-full items-center justify-between rounded-full px-3 py-1.5 text-sm transition-colors",
									isActive ? "bg-muted" : "hover:bg-muted/70",
								)}
							>
								<ClientStatusBadge status={item.value} />
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
