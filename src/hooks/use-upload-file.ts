import { useConvex, useMutation } from "convex/react";
import * as React from "react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";

export interface UploadedFile {
	url: string;
	name: string;
	size: number;
	type: string;
	key: string;
}

interface UseUploadFileProps {
	onUploadComplete?: (file: UploadedFile) => void;
	onUploadError?: (error: unknown) => void;
}

export function useUploadFile({
	onUploadComplete,
	onUploadError,
}: UseUploadFileProps = {}) {
	const convex = useConvex();
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);

	const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
	const [uploadingFile, setUploadingFile] = React.useState<File>();
	const [progress, setProgress] = React.useState<number>(0);
	const [isUploading, setIsUploading] = React.useState(false);

	// Stable refs for callback props to avoid re-creating uploadFile
	const onUploadCompleteRef = useRef(onUploadComplete);
	onUploadCompleteRef.current = onUploadComplete;
	const onUploadErrorRef = useRef(onUploadError);
	onUploadErrorRef.current = onUploadError;

	const uploadFile = useCallback(
		async (file: File) => {
			setIsUploading(true);
			setUploadingFile(file);
			setProgress(0);

			try {
				// Step 1: Get a signed upload URL from Convex
				setProgress(10);
				const uploadUrl = await generateUploadUrl();

				// Step 2: Upload the file directly to Convex storage
				setProgress(30);
				const result = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type },
					body: file,
				});

				if (!result.ok) {
					throw new Error(`Upload failed: ${result.statusText}`);
				}

				setProgress(70);
				const { storageId } = (await result.json()) as { storageId: string };

				// Step 3: Get the serving URL
				setProgress(90);
				const url = await convex.query(api.files.getUrl, {
					storageId: storageId as never,
				});

				if (!url) {
					throw new Error("Failed to get file URL after upload");
				}

				const uploaded: UploadedFile = {
					url,
					name: file.name,
					size: file.size,
					type: file.type,
					key: storageId,
				};

				setProgress(100);
				setUploadedFile(uploaded);
				onUploadCompleteRef.current?.(uploaded);

				return uploaded;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Something went wrong, please try again later.";

				toast.error(message);
				onUploadErrorRef.current?.(error);

				return undefined;
			} finally {
				setProgress(0);
				setIsUploading(false);
				setUploadingFile(undefined);
			}
		},
		[convex, generateUploadUrl],
	);

	return {
		isUploading,
		progress,
		uploadedFile,
		uploadFile,
		uploadingFile,
	};
}
