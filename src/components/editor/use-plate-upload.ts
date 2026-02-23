/**
 * Convex file upload hook for Plate.js editors.
 *
 * Single source of truth for file uploads — replaces the 4 duplicate
 * upload functions that existed across BlockNote editors.
 *
 * Used by Plate's PlaceholderPlugin (media-placeholder-node) for
 * drag-and-drop and click-to-upload media insertion.
 */
export type { UploadedFile } from "@/hooks/use-upload-file";
export { useUploadFile as usePlateUpload } from "@/hooks/use-upload-file";
