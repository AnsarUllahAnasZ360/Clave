"use client";

import {
	Paperclip,
	Tag,
	UploadSimple,
	X,
} from "@phosphor-icons/react/dist/ssr";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { ProjectDescriptionEditor } from "@/components/project-wizard/ProjectDescriptionEditor";
import { QuickCreateModalLayout } from "@/components/QuickCreateModalLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { User } from "@/lib/data/project-details";

type NoteType = "general" | "meeting" | "audio";

type LabelOption = {
	_id: string;
	name: string;
	color: string;
};

type CreateNoteModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentUser: User;
	onCreateNote: (
		title: string,
		content: string,
		noteType: NoteType,
		labelIds: string[],
	) => void;
	onUploadAudio: () => void;
	labels?: LabelOption[];
};

export function CreateNoteModal({
	open,
	onOpenChange,
	currentUser,
	onCreateNote,
	onUploadAudio,
	labels = [],
}: CreateNoteModalProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState<string | undefined>(undefined);
	const [isExpanded, setIsExpanded] = useState(false);
	const [noteType, setNoteType] = useState<NoteType>("general");
	const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
	const [labelPickerOpen, setLabelPickerOpen] = useState(false);

	useEffect(() => {
		if (!open) return;

		setTitle("");
		setDescription(undefined);
		setIsExpanded(false);
		setNoteType("general");
		setSelectedLabelIds([]);
	}, [open]);

	const handleClose = () => {
		onOpenChange(false);
	};

	const handleCreate = () => {
		onCreateNote(title, description ?? "", noteType, selectedLabelIds);
		setTitle("");
		setDescription(undefined);
		onOpenChange(false);
	};

	const handleUploadClick = () => {
		onUploadAudio();
	};

	const handleLabelToggle = (labelId: string) => {
		setSelectedLabelIds((prev) =>
			prev.includes(labelId)
				? prev.filter((id) => id !== labelId)
				: [...prev, labelId],
		);
	};

	const selectedLabels = labels.filter((l) => selectedLabelIds.includes(l._id));

	return (
		<QuickCreateModalLayout
			open={open}
			onClose={handleClose}
			isDescriptionExpanded={isExpanded}
			onSubmitShortcut={handleCreate}
		>
			{/* Title row with close button */}
			<div className="flex items-center justify-between gap-2 w-full shrink-0 mt-1">
				<div className="flex flex-col gap-2 flex-1">
					<div className="flex gap-1 h-10 items-center w-full">
						<input
							id="note-create-title"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Note title"
							className="w-full font-normal leading-7 text-foreground placeholder:text-muted-foreground text-xl outline-none bg-transparent border-none p-0"
							autoComplete="off"
						/>
					</div>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="h-8 w-8 rounded-full opacity-70 hover:opacity-100"
					onClick={handleClose}
				>
					<X className="h-4 w-4 text-muted-foreground" />
				</Button>
			</div>

			{/* Description */}
			<ProjectDescriptionEditor
				value={description}
				onChange={setDescription}
				onExpandChange={setIsExpanded}
				placeholder="Write the details of this note..."
				showTemplates={false}
			/>

			{/* Note context (author + type + labels) */}
			<div className="flex items-center gap-2 mt-2 flex-wrap">
				<div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-muted/50">
					<Avatar className="h-5 w-5">
						<AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
						<AvatarFallback className="text-[10px]">
							{currentUser.name.charAt(0)}
						</AvatarFallback>
					</Avatar>
					<span className="text-sm font-medium">{currentUser.name}</span>
				</div>

				{/* Note type selector */}
				<div className="flex items-center gap-2 px-1 py-0.5 rounded-full border border-border">
					<Tag className="h-4 w-4 text-muted-foreground ml-2" />
					<Select
						value={noteType}
						onValueChange={(v) => setNoteType(v as NoteType)}
					>
						<SelectTrigger className="border-0 shadow-none h-7 px-1 text-sm min-w-[90px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="general">General</SelectItem>
							<SelectItem value="meeting">Meeting</SelectItem>
							<SelectItem value="audio">Audio</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Label picker */}
				<Popover open={labelPickerOpen} onOpenChange={setLabelPickerOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted/50 transition-colors text-sm"
						>
							{selectedLabels.length > 0 ? (
								<span className="flex items-center gap-1">
									{selectedLabels.slice(0, 2).map((label) => (
										<span
											key={label._id}
											className="inline-flex items-center gap-1"
										>
											<span
												className="h-2 w-2 rounded-full shrink-0"
												style={{ backgroundColor: label.color }}
											/>
											<span className="truncate max-w-[60px]">
												{label.name}
											</span>
										</span>
									))}
									{selectedLabels.length > 2 && (
										<span className="text-muted-foreground">
											+{selectedLabels.length - 2}
										</span>
									)}
								</span>
							) : (
								<span className="text-muted-foreground">Add labels</span>
							)}
						</button>
					</PopoverTrigger>
					<PopoverContent className="p-0 w-[220px]" align="start">
						<Command>
							<CommandInput placeholder="Search labels..." />
							<CommandList>
								<CommandEmpty>No labels found.</CommandEmpty>
								<CommandGroup>
									{labels.map((label) => {
										const isSelected = selectedLabelIds.includes(label._id);
										return (
											<CommandItem
												key={label._id}
												value={label.name}
												onSelect={() => handleLabelToggle(label._id)}
												className="cursor-pointer"
											>
												<div className="flex items-center gap-2 w-full">
													<span
														className="h-3 w-3 rounded-full shrink-0"
														style={{ backgroundColor: label.color }}
													/>
													<span className="flex-1">{label.name}</span>
													{isSelected && (
														<Check className="h-4 w-4 text-primary" />
													)}
												</div>
											</CommandItem>
										);
									})}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between mt-auto w-full pt-4 shrink-0">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon-sm"
						className="text-muted-foreground"
					>
						<Paperclip className="h-4 w-4" />
					</Button>
				</div>

				<div className="flex items-center gap-2">
					<Button variant="secondary" size="sm" onClick={handleUploadClick}>
						<UploadSimple className="h-4 w-4" />
						Upload audio file
					</Button>
					<Button size="sm" onClick={handleCreate}>
						Create Note
					</Button>
				</div>
			</div>
		</QuickCreateModalLayout>
	);
}
