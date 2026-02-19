"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { NoteBlockNoteEditorDynamic } from "@/components/notes/BlockNoteEditorDynamic";
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
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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

type NoteType = "general" | "meeting" | "audio";

type LabelOption = {
	_id: string;
	name: string;
	color: string;
};

type NoteEditModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	content?: string;
	noteType?: NoteType;
	labelIds?: string[];
	onSave: (
		title: string,
		content: string,
		noteType: NoteType,
		labelIds: string[],
	) => void;
	labels?: LabelOption[];
};

export function NoteEditModal({
	open,
	onOpenChange,
	title: initialTitle,
	content: initialContent,
	noteType: initialNoteType = "general",
	labelIds: initialLabelIds = [],
	onSave,
	labels = [],
}: NoteEditModalProps) {
	const [title, setTitle] = useState(initialTitle);
	const [content, setContent] = useState(initialContent);
	const [noteType, setNoteType] = useState<NoteType>(initialNoteType);
	const [selectedLabelIds, setSelectedLabelIds] =
		useState<string[]>(initialLabelIds);
	const [labelPickerOpen, setLabelPickerOpen] = useState(false);

	useEffect(() => {
		if (open) {
			setTitle(initialTitle);
			setContent(initialContent);
			setNoteType(initialNoteType);
			setSelectedLabelIds(initialLabelIds);
		}
	}, [open, initialTitle, initialContent, initialNoteType, initialLabelIds]);

	const handleSave = () => {
		onSave(title, content ?? "", noteType, selectedLabelIds);
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[700px] p-0 gap-0 max-h-[80vh] overflow-hidden rounded-2xl">
				<DialogHeader className="sr-only">
					<VisuallyHidden>
						<DialogTitle>Edit note</DialogTitle>
					</VisuallyHidden>
				</DialogHeader>

				<div className="flex items-center justify-between p-4 border-b border-border">
					<h2 className="text-lg font-semibold">Edit note</h2>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => onOpenChange(false)}
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				<div className="p-4 space-y-4 overflow-y-auto">
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Note title"
						className="w-full font-medium text-lg text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none p-0"
					/>

					<div className="flex items-center gap-4 flex-wrap">
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">Type</span>
							<Select
								value={noteType}
								onValueChange={(v) => setNoteType(v as NoteType)}
							>
								<SelectTrigger size="sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="general">General</SelectItem>
									<SelectItem value="meeting">Meeting</SelectItem>
									<SelectItem value="audio">Audio</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">Labels</span>
							<Popover open={labelPickerOpen} onOpenChange={setLabelPickerOpen}>
								<PopoverTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-muted/50 transition-colors text-sm min-h-[32px]"
									>
										{selectedLabels.length > 0 ? (
											<span className="flex items-center gap-1">
												{selectedLabels.slice(0, 3).map((label) => (
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
												{selectedLabels.length > 3 && (
													<span className="text-muted-foreground">
														+{selectedLabels.length - 3}
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
													const isSelected = selectedLabelIds.includes(
														label._id,
													);
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
					</div>

					<NoteBlockNoteEditorDynamic
						content={content}
						editable={true}
						onUpdate={setContent}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 p-4 border-t border-border">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave}>Save</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
