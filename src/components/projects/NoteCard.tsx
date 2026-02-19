import { DotsThree, File, Waveform } from "@phosphor-icons/react/dist/ssr";
import { format } from "date-fns";
import { extractTextPreview } from "@/components/projects/TipTapEditor";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectNote } from "@/lib/data/project-details";

type LabelOption = {
	_id: string;
	name: string;
	color: string;
};

type NoteCardProps = {
	note: ProjectNote;
	onEdit?: (noteId: string) => void;
	onDelete?: (noteId: string) => void;
	onClick?: () => void;
	allLabels?: LabelOption[];
};

export function NoteCard({
	note,
	onEdit,
	onDelete,
	onClick,
	allLabels = [],
}: NoteCardProps) {
	const isAudio = note.noteType === "audio";
	const noteLabels = allLabels.filter((l) => note.labelIds?.includes(l._id));

	return (
		<div
			className="flex flex-col gap-1 rounded-xl border border-border bg-muted p-1 hover:shadow-sm hover:cursor-pointer transition-shadow"
			onClick={onClick}
		>
			<div className="flex items-center justify-between gap-2 p-1">
				<div className="flex h-6 w-6 items-center justify-center">
					{isAudio ? (
						<Waveform className="h-4 w-4 text-muted-foreground" />
					) : (
						<File className="h-4 w-4 text-muted-foreground" />
					)}
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="h-6 w-6 text-muted-foreground hover:text-foreground"
						>
							<DotsThree className="h-4 w-4" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => onEdit?.(note.id)}>
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onDelete?.(note.id)}>
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="rounded-lg bg-background px-3 py-3">
				<h3 className="text-md font-medium text-foreground line-clamp-1">
					{note.title}
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					{format(note.addedDate, "d MMM")}
				</p>
				{note.content && (
					<p className="mt-1 text-xs text-muted-foreground/70 line-clamp-2">
						{extractTextPreview(note.content, 100)}
					</p>
				)}
				{noteLabels.length > 0 && (
					<div className="mt-2 flex items-center gap-1 flex-wrap">
						{noteLabels.slice(0, 3).map((label) => (
							<span
								key={label._id}
								className="inline-flex items-center gap-1 text-xs text-muted-foreground"
							>
								<span
									className="h-2 w-2 rounded-full shrink-0"
									style={{ backgroundColor: label.color }}
								/>
								<span className="truncate max-w-[60px]">{label.name}</span>
							</span>
						))}
						{noteLabels.length > 3 && (
							<span className="text-xs text-muted-foreground">
								+{noteLabels.length - 3}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
