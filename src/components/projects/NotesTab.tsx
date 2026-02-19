"use client";

import { Plus } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateNoteModal } from "@/components/projects/CreateNoteModal";
import { NoteCard } from "@/components/projects/NoteCard";
import { NoteEditModal } from "@/components/projects/NoteEditModal";
import { NotePreviewModal } from "@/components/projects/NotePreviewModal";
import { NotesTable } from "@/components/projects/NotesTable";
import { UploadAudioModal } from "@/components/projects/UploadAudioModal";
import { Button } from "@/components/ui/button";
import type { ProjectNote, User } from "@/lib/data/project-details";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type NotesTabProps = {
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
};

export function NotesTab({ projectId, workspaceId }: NotesTabProps) {
	const notes = useQuery(api.notes.listByProject, { projectId });
	const currentUser = useQuery(api.users.current);
	const labelsData = useQuery(api.labels.list, { workspaceId });
	const createNote = useMutation(api.notes.create);
	const updateNote = useMutation(api.notes.update);
	const removeNote = useMutation(api.notes.remove);

	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
	const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [selectedNote, setSelectedNote] = useState<ProjectNote | null>(null);
	const [editingNoteId, setEditingNoteId] = useState<Id<"notes"> | null>(null);
	const [editingContent, setEditingContent] = useState<string | undefined>(
		undefined,
	);
	const [editingTitle, setEditingTitle] = useState("");
	const [editingNoteType, setEditingNoteType] = useState<
		"general" | "meeting" | "audio"
	>("general");
	const [editingLabelIds, setEditingLabelIds] = useState<string[]>([]);

	const labels = useMemo(
		() =>
			(labelsData ?? []).map((l) => ({
				_id: l._id as string,
				name: l.name,
				color: l.color,
			})),
		[labelsData],
	);

	// Map Convex notes to ProjectNote type for child components
	const mappedNotes = useMemo<ProjectNote[]>(() => {
		if (!notes) return [];
		return notes.map((note) => ({
			id: note._id,
			title: note.title,
			content: note.content,
			noteType: note.noteType as "general" | "meeting" | "audio",
			status: "completed" as const,
			addedDate: new Date(note._creationTime),
			addedBy: {
				id: note.createdBy,
				name: currentUser?.name ?? "User",
				avatarUrl: currentUser?.avatarUrl ?? currentUser?.image,
			},
			labelIds: (note.labelIds as string[]) ?? [],
		}));
	}, [notes, currentUser]);

	const recentNotes = mappedNotes.slice(0, 8);

	const user: User = {
		id: currentUser?._id ?? "unknown",
		name: currentUser?.name ?? "User",
		avatarUrl: currentUser?.avatarUrl ?? currentUser?.image,
	};

	const handleAddNote = () => {
		setIsCreateModalOpen(true);
	};

	const handleCreateNote = async (
		title: string,
		content: string,
		noteType: "general" | "meeting" | "audio",
		labelIds: string[],
	) => {
		try {
			await createNote({
				workspaceId,
				projectId,
				title,
				content,
				noteType,
				labelIds:
					labelIds.length > 0 ? (labelIds as Id<"labels">[]) : undefined,
			});
			toast.success("Note created");
		} catch {
			toast.error("Failed to create note");
		}
	};

	const handleUploadAudio = () => {
		setIsUploadModalOpen(true);
	};

	const handleFileSelect = (fileName: string) => {
		setIsUploadModalOpen(false);
		setIsCreateModalOpen(false);
		toast(`Processing "${fileName}" into a note...`);
	};

	const handleNoteClick = (note: ProjectNote) => {
		setSelectedNote(note);
		setIsPreviewModalOpen(true);
	};

	const handleEditNote = (noteId: string) => {
		const note = notes?.find((n) => n._id === noteId);
		if (!note) return;
		setEditingNoteId(note._id);
		setEditingTitle(note.title);
		setEditingContent(note.content);
		setEditingNoteType(
			(note.noteType as "general" | "meeting" | "audio") ?? "general",
		);
		setEditingLabelIds((note.labelIds as string[]) ?? []);
		setIsEditModalOpen(true);
	};

	const handleSaveEdit = async (
		title: string,
		content: string,
		noteType: "general" | "meeting" | "audio",
		labelIds: string[],
	) => {
		if (!editingNoteId) return;
		try {
			await updateNote({
				noteId: editingNoteId,
				title,
				content,
				noteType,
				labelIds: labelIds as Id<"labels">[],
			});
			setIsEditModalOpen(false);
			setEditingNoteId(null);
			toast.success("Note updated");
		} catch {
			toast.error("Failed to update note");
		}
	};

	const handleDeleteNote = async (noteId: string) => {
		try {
			await removeNote({ noteId: noteId as Id<"notes"> });
			toast.success("Note deleted");
		} catch {
			toast.error("Failed to delete note");
		}
	};

	if (notes === undefined) {
		return (
			<div className="space-y-8 py-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{["sk-1", "sk-2", "sk-3", "sk-4"].map((key) => (
						<div
							key={key}
							className="h-24 animate-pulse rounded-xl border border-border bg-muted"
						/>
					))}
				</div>
			</div>
		);
	}

	if (mappedNotes.length === 0) {
		return (
			<div className="space-y-4 py-4">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold text-accent-foreground">
						Notes
					</h2>
					<Button variant="ghost" size="sm" onClick={handleAddNote}>
						<Plus className="h-4 w-4" />
						Add notes
					</Button>
				</div>
				<section className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
					No notes yet. Create your first note to get started.
				</section>
				<CreateNoteModal
					open={isCreateModalOpen}
					onOpenChange={setIsCreateModalOpen}
					currentUser={user}
					onCreateNote={handleCreateNote}
					onUploadAudio={handleUploadAudio}
					labels={labels}
				/>
				<UploadAudioModal
					open={isUploadModalOpen}
					onOpenChange={setIsUploadModalOpen}
					onFileSelect={handleFileSelect}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<section>
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-sm font-semibold text-accent-foreground">
						Recent notes
					</h2>
					<Button variant="ghost" size="sm" onClick={handleAddNote}>
						<Plus className="h-4 w-4" />
						Add notes
					</Button>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{recentNotes.map((note) => (
						<NoteCard
							key={note.id}
							note={note}
							onEdit={handleEditNote}
							onDelete={handleDeleteNote}
							onClick={() => handleNoteClick(note)}
							allLabels={labels}
						/>
					))}
				</div>
			</section>

			<section>
				<h2 className="mb-4 text-sm font-semibold text-accent-foreground">
					All notes
				</h2>
				<NotesTable
					notes={mappedNotes}
					onAddNote={handleAddNote}
					onEditNote={handleEditNote}
					onDeleteNote={handleDeleteNote}
					onNoteClick={handleNoteClick}
					allLabels={labels}
				/>
			</section>

			<CreateNoteModal
				open={isCreateModalOpen}
				onOpenChange={setIsCreateModalOpen}
				currentUser={user}
				onCreateNote={handleCreateNote}
				onUploadAudio={handleUploadAudio}
				labels={labels}
			/>

			<UploadAudioModal
				open={isUploadModalOpen}
				onOpenChange={setIsUploadModalOpen}
				onFileSelect={handleFileSelect}
			/>

			<NotePreviewModal
				open={isPreviewModalOpen}
				onOpenChange={setIsPreviewModalOpen}
				note={selectedNote}
			/>

			<NoteEditModal
				open={isEditModalOpen}
				onOpenChange={setIsEditModalOpen}
				title={editingTitle}
				content={editingContent}
				noteType={editingNoteType}
				labelIds={editingLabelIds}
				onSave={handleSaveEdit}
				labels={labels}
			/>
		</div>
	);
}
