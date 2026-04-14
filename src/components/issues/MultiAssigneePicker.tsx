"use client";

import { Check, User, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AssigneeMember = {
	id: string;
	name: string;
	image?: string;
};

type Props = {
	members: AssigneeMember[];
	/** Currently-assigned user ids (multi). */
	selectedIds: string[];
	/** Called with the next assignee set whenever the user toggles a member. */
	onChange: (nextIds: string[]) => void;
	/** Trigger label/avatar layout: "compact" (avatars only) or "full" (avatars + name). */
	variant?: "compact" | "full";
	className?: string;
};

/**
 * Multi-assignee picker — Popover + checkbox-style Command list.
 *
 * Why: every "assign people" surface in the app should support multi-assign,
 * and we don't want each one to reinvent the popover. Drop this in wherever a
 * single `<GenericPicker>` for assignees used to live, and pass an effective
 * `selectedIds` array (the caller is responsible for merging legacy
 * `assigneeId` into the array).
 */
export function MultiAssigneePicker({
	members,
	selectedIds,
	onChange,
	variant = "full",
	className,
}: Props) {
	const [open, setOpen] = useState(false);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedMembers = useMemo(
		() => members.filter((m) => selectedSet.has(m.id)),
		[members, selectedSet],
	);

	const toggle = (id: string) => {
		const next = selectedSet.has(id)
			? selectedIds.filter((x) => x !== id)
			: [...selectedIds, id];
		onChange(next);
	};

	const clearAll = () => onChange([]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Edit assignees"
					className={cn(
						"flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors text-sm min-w-0",
						className,
					)}
				>
					{selectedMembers.length === 0 ? (
						<>
							<User className="h-4 w-4 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground">Unassigned</span>
						</>
					) : variant === "compact" ? (
						<div className="flex items-center -space-x-1">
							{selectedMembers.slice(0, 3).map((m) => (
								<Avatar
									key={m.id}
									className="size-5 ring-2 ring-background shrink-0"
								>
									{m.image && <AvatarImage src={m.image} alt={m.name} />}
									<AvatarFallback className="text-[9px]">
										{m.name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							))}
							{selectedMembers.length > 3 && (
								<span className="text-[10px] text-muted-foreground ml-1">
									+{selectedMembers.length - 3}
								</span>
							)}
						</div>
					) : (
						<>
							<div className="flex items-center -space-x-1.5 shrink-0">
								{selectedMembers.slice(0, 3).map((m) => (
									<Avatar
										key={m.id}
										className="size-5 ring-2 ring-background shrink-0"
									>
										{m.image && <AvatarImage src={m.image} alt={m.name} />}
										<AvatarFallback className="text-[9px]">
											{m.name.charAt(0).toUpperCase()}
										</AvatarFallback>
									</Avatar>
								))}
							</div>
							<span className="truncate">
								{selectedMembers.length === 1
									? selectedMembers[0].name
									: `${selectedMembers.length} assignees`}
							</span>
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[280px]" align="start">
				<Command>
					<CommandInput placeholder="Search members..." />
					<CommandList>
						<CommandEmpty>No members found.</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value="Unassigned"
								onSelect={clearAll}
								className="cursor-pointer"
							>
								<div className="flex items-center gap-2 w-full">
									<X className="h-4 w-4 text-muted-foreground" />
									<span className="flex-1">Unassigned</span>
									{selectedIds.length === 0 && (
										<Check className="h-4 w-4 text-primary" />
									)}
								</div>
							</CommandItem>
						</CommandGroup>
						<CommandGroup>
							{members.map((option) => {
								const isSelected = selectedSet.has(option.id);
								return (
									<CommandItem
										key={option.id}
										value={option.name}
										onSelect={() => toggle(option.id)}
										className="cursor-pointer"
									>
										<div className="flex items-center gap-2 w-full">
											<Avatar className="h-5 w-5">
												{option.image && (
													<AvatarImage src={option.image} alt={option.name} />
												)}
												<AvatarFallback className="text-[9px]">
													{option.name.charAt(0).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<span className="flex-1">{option.name}</span>
											{isSelected && <Check className="h-4 w-4 text-primary" />}
										</div>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Helper: merge legacy `assigneeId` and `assigneeIds` into a single canonical
 * id array. Use at every read site so a half-migrated record (only one of the
 * two fields populated) still produces the right selected set.
 */
export function effectiveAssigneeIds(issue: {
	assigneeId?: string | null;
	assigneeIds?: string[] | null;
}): string[] {
	const set = new Set<string>();
	if (issue.assigneeIds) for (const id of issue.assigneeIds) set.add(id);
	if (issue.assigneeId) set.add(issue.assigneeId);
	return [...set];
}
