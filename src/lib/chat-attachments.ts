import type { ChatAttachmentInput } from "@/hooks/use-ai-chat";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Data URLs longer than this are uploaded to Convex `_storage` before `ai/chat:sendMessage`,
 * so the action payload stays under Convex's ~1 MiB limit.
 */
const INLINE_DATA_URL_MAX_CHARS = 55_000;

async function uploadBlobToConvex(
	blob: Blob,
	generateUploadUrl: () => Promise<string>,
): Promise<Id<"_storage">> {
	const uploadUrl = await generateUploadUrl();
	const result = await fetch(uploadUrl, {
		method: "POST",
		headers: { "Content-Type": blob.type || "application/octet-stream" },
		body: blob,
	});
	if (!result.ok) {
		throw new Error(`Attachment upload failed: ${result.statusText}`);
	}
	const json = (await result.json()) as { storageId: string };
	return json.storageId as Id<"_storage">;
}

/**
 * Replaces large inline `data:` URLs with Convex `storageId` references for small action args.
 */
export async function prepareChatAttachmentsForConvex(
	files: ChatAttachmentInput[],
	generateUploadUrl: () => Promise<string>,
): Promise<ChatAttachmentInput[]> {
	return Promise.all(
		files.map((file) => prepareOneAttachment(file, generateUploadUrl)),
	);
}

async function prepareOneAttachment(
	file: ChatAttachmentInput,
	generateUploadUrl: () => Promise<string>,
): Promise<ChatAttachmentInput> {
	const url = file.url;
	if (file.storageId) {
		return file;
	}
	if (!url || !url.startsWith("data:")) {
		return file;
	}
	if (url.length <= INLINE_DATA_URL_MAX_CHARS) {
		return file;
	}
	const res = await fetch(url);
	const blob = await res.blob();
	const storageId = await uploadBlobToConvex(blob, generateUploadUrl);
	return {
		filename: file.filename,
		mediaType: file.mediaType ?? blob.type ?? undefined,
		storageId,
	};
}
