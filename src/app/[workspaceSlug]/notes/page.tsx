"use client";

import { Plus } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NoteCard } from "@/components/projects/NoteCard";
import { NoteEditModal } from "@/components/projects/NoteEditModal";
import { NotePreviewModal } from "@/components/projects/NotePreviewModal";
import { NotesTable } from "@/components/projects/NotesTable";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ProjectNote } from "@/lib/data/project-details";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function NotesPage() {
	const { workspaceId } = useWorkspace();
	const notes = useQuery(api.notes.listByWorkspace, { workspaceId });
	const currentUser = useQuery(api.users.current);
	const labelsData = useQuery(api.labels.list, { workspaceId });
	const createNote = useMutation(api.notes.create);
	const updateNote = useMutation(api.notes.update);
	const removeNote = useMutation(api.notes.remove);

	const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isCreateMode, setIsCreateMode] = useState(false);
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
				avatarUrl: currentUser?.image,
			},
			labelIds: (note.labelIds as string[]) ?? [],
		}));
	}, [notes, currentUser]);

	const recentNotes = mappedNotes.slice(0, 8);

	const handleAddNote = () => {
		setEditingNoteId(null);
		setEditingTitle("");
		setEditingContent(undefined);
		setEditingNoteType("general");
		setEditingLabelIds([]);
		setIsCreateMode(true);
		setIsEditModalOpen(true);
	};

	const handleSaveNote = async (
		title: string,
		content: string,
		noteType: "general" | "meeting" | "audio",
		labelIds: string[],
	) => {
		try {
			if (isCreateMode) {
				await createNote({
					workspaceId,
					title,
					content,
					noteType,
					labelIds:
						labelIds.length > 0 ? (labelIds as Id<"labels">[]) : undefined,
				});
				toast.success("Note created");
			} else if (editingNoteId) {
				await updateNote({
					noteId: editingNoteId,
					title,
					content,
					noteType,
					labelIds: labelIds as Id<"labels">[],
				});
				toast.success("Note updated");
			}
			setIsEditModalOpen(false);
			setEditingNoteId(null);
			setIsCreateMode(false);
		} catch {
			toast.error(
				isCreateMode ? "Failed to create note" : "Failed to update note",
			);
		}
	};

	const handleEditNote = (noteId: string) => {
		const note = notes?.find((n) => n._id === noteId);
		if (!note) return;
		setEditingNoteId(note._id);
		setEditingTitle(note.title);
		setEditingContent(note.content);
		setEditingNoteType(note.noteType as "general" | "meeting" | "audio");
		setEditingLabelIds((note.labelIds as string[]) ?? []);
		setIsCreateMode(false);
		setIsEditModalOpen(true);
	};

	const handleDeleteNote = async (noteId: string) => {
		try {
			await removeNote({ noteId: noteId as Id<"notes"> });
			toast.success("Note deleted");
		} catch {
			toast.error("Failed to delete note");
		}
	};

	const handleNoteClick = (note: ProjectNote) => {
		setSelectedNote(note);
		setIsPreviewModalOpen(true);
	};

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
			<div className="sticky top-0 z-10 bg-background flex items-center justify-between border-b border-border px-6 py-4">
				<div className="flex items-center gap-3">
					<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
					<h1 className="text-lg font-semibold">Notes</h1>
				</div>
				<Button variant="ghost" size="sm" onClick={handleAddNote}>
					<Plus className="h-4 w-4" />
					New note
				</Button>
			</div>
			<div className="flex-1 p-6 space-y-8">
				{notes === undefined ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{["sk-1", "sk-2", "sk-3", "sk-4"].map((key) => (
							<div
								key={key}
								className="h-24 animate-pulse rounded-xl border border-border bg-muted"
							/>
						))}
					</div>
				) : mappedNotes.length === 0 ? (
					<section className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
						No notes yet. Create your first note to get started.
					</section>
				) : (
					<>
						{recentNotes.length > 0 && (
							<section>
								<h2 className="mb-4 text-sm font-semibold text-accent-foreground">
									Recent notes
								</h2>
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
						)}

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
					</>
				)}
			</div>

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
				onSave={handleSaveNote}
				labels={labels}
			/>
		</div>
	);
}
