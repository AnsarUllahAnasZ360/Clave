"use client";

import { FileArrowUp } from "@phosphor-icons/react/dist/ssr";
import { Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

type FileFormat = "markdown" | "html";

interface ImportDocumentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImport: (content: string, format: FileFormat) => void;
	importing?: boolean;
}

const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".html", ".htm"];
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

function detectFormat(filename: string): FileFormat | null {
	const ext = filename.toLowerCase().split(".").pop();
	if (ext === "md" || ext === "markdown") return "markdown";
	if (ext === "html" || ext === "htm") return "html";
	return null;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportDocumentDialog({
	open,
	onOpenChange,
	onImport,
	importing = false,
}: ImportDocumentDialogProps) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const reset = useCallback(() => {
		setSelectedFile(null);
		setError(null);
		setDragOver(false);
	}, []);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) reset();
			onOpenChange(nextOpen);
		},
		[onOpenChange, reset],
	);

	const validateAndSetFile = useCallback((file: File) => {
		setError(null);

		const format = detectFormat(file.name);
		if (!format) {
			setError(
				`Unsupported file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(", ")}`,
			);
			setSelectedFile(null);
			return;
		}

		if (file.size > MAX_FILE_SIZE) {
			setError(
				`File too large (${formatFileSize(file.size)}). Maximum size is 1 MB.`,
			);
			setSelectedFile(null);
			return;
		}

		if (file.size === 0) {
			setError("File is empty.");
			setSelectedFile(null);
			return;
		}

		setSelectedFile(file);
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) validateAndSetFile(file);
		},
		[validateAndSetFile],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files?.[0];
			if (file) validateAndSetFile(file);
		},
		[validateAndSetFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
	}, []);

	const handleImport = useCallback(() => {
		if (!selectedFile) return;

		const format = detectFormat(selectedFile.name);
		if (!format) return;

		const reader = new FileReader();
		reader.onload = () => {
			const content = reader.result as string;
			onImport(content, format);
		};
		reader.onerror = () => {
			setError("Failed to read file.");
		};
		reader.readAsText(selectedFile);
	}, [selectedFile, onImport]);

	const detectedFormat = selectedFile ? detectFormat(selectedFile.name) : null;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Import from file</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Drop zone / file picker */}
					<button
						type="button"
						onClick={() => inputRef.current?.click()}
						onDrop={handleDrop}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						className={`flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
							dragOver
								? "border-primary bg-primary/5"
								: "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
						}`}
					>
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<Upload className="h-5 w-5 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium text-foreground">
								Drop a file here or click to browse
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Supports Markdown (.md) and HTML (.html) files up to 1 MB
							</p>
						</div>
					</button>

					<input
						ref={inputRef}
						type="file"
						accept={ACCEPTED_EXTENSIONS.join(",")}
						onChange={handleFileChange}
						className="hidden"
					/>

					{/* Selected file preview */}
					{selectedFile && !error && (
						<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
							<FileArrowUp className="h-5 w-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-foreground">
									{selectedFile.name}
								</p>
								<p className="text-xs text-muted-foreground">
									{formatFileSize(selectedFile.size)}
									{detectedFormat && (
										<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
											{detectedFormat}
										</span>
									)}
								</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setSelectedFile(null);
									if (inputRef.current) inputRef.current.value = "";
								}}
								className="text-xs text-muted-foreground hover:text-foreground"
							>
								Remove
							</button>
						</div>
					)}

					{/* Error */}
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={importing}
					>
						Cancel
					</Button>
					<Button
						onClick={handleImport}
						disabled={!selectedFile || !!error || importing}
					>
						{importing ? "Importing..." : "Import"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
