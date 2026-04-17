/**
 * Syncs embedded Excalidraw image file payloads (base64 data URLs in the
 * scene JSON `files` map) into addressable Convex file storage rows in the
 * `whiteboardImages` table. Runs as a scheduled internal action after every
 * scene update so downstream AI features (RAG, OCR, rich descriptions) can
 * reference images by storageId instead of parsing sceneData every time.
 */

import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";

/** Skip enormous payloads — same cap used by the vision extractor. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type SceneFileEntry = { dataURL?: string };

type ParsedImage = {
	fileKey: string;
	mediaType: string;
	bytes: Uint8Array;
	sha256: string;
};

function base64ToBytes(base64: string): Uint8Array {
	const bin = atob(base64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
	return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	// Copy into a fresh ArrayBuffer so the type is unambiguously ArrayBuffer
	// (crypto.subtle.digest rejects SharedArrayBuffer-typed views under strict TS).
	const buf = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buf).set(bytes);
	const hash = await crypto.subtle.digest("SHA-256", buf);
	const view = new Uint8Array(hash);
	let hex = "";
	for (const b of view) hex += b.toString(16).padStart(2, "0");
	return hex;
}

async function parseSceneImages(sceneJson: string): Promise<ParsedImage[]> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(sceneJson);
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object") return [];
	const files = (parsed as { files?: Record<string, SceneFileEntry> }).files;
	if (!files || typeof files !== "object") return [];

	const out: ParsedImage[] = [];
	for (const [fileKey, entry] of Object.entries(files)) {
		const dataURL = entry?.dataURL;
		if (typeof dataURL !== "string") continue;
		if (!dataURL.startsWith("data:image/")) continue;
		const semi = dataURL.indexOf(";");
		const comma = dataURL.indexOf(",");
		if (semi <= 5 || comma < 0) continue;
		const mediaType = dataURL.slice(5, semi) || "image/png";
		const base64 = dataURL.slice(comma + 1);
		if (!base64) continue;
		// Rough byte size: base64 length * 3/4
		const approxBytes = Math.floor((base64.length * 3) / 4);
		if (approxBytes > MAX_IMAGE_BYTES) continue;
		let bytes: Uint8Array;
		try {
			bytes = base64ToBytes(base64);
		} catch {
			continue;
		}
		const sha256 = await sha256Hex(bytes);
		out.push({ fileKey, mediaType, bytes, sha256 });
	}
	return out;
}

export const listBoardImages = internalQuery({
	args: { whiteboardId: v.id("whiteboards") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("whiteboardImages")
			.withIndex("by_whiteboard", (q) =>
				q.eq("whiteboardId", args.whiteboardId),
			)
			.collect();
	},
});

export const upsertBoardImage = internalMutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		workspaceId: v.id("workspaces"),
		fileKey: v.string(),
		storageId: v.id("_storage"),
		mediaType: v.string(),
		byteSize: v.number(),
		sha256: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("whiteboardImages")
			.withIndex("by_whiteboard_filekey", (q) =>
				q.eq("whiteboardId", args.whiteboardId).eq("fileKey", args.fileKey),
			)
			.unique();

		const now = Date.now();
		if (existing) {
			// Replace stale storage object, keep the row.
			if (existing.storageId !== args.storageId) {
				try {
					await ctx.storage.delete(existing.storageId);
				} catch {
					// ignore — storage object may already be gone
				}
			}
			await ctx.db.patch(existing._id, {
				storageId: args.storageId,
				mediaType: args.mediaType,
				byteSize: args.byteSize,
				sha256: args.sha256,
				updatedAt: now,
				// Invalidate caption/OCR when the binary changes.
				ocrText: undefined,
				caption: undefined,
			});
			return existing._id;
		}

		return await ctx.db.insert("whiteboardImages", {
			whiteboardId: args.whiteboardId,
			workspaceId: args.workspaceId,
			fileKey: args.fileKey,
			storageId: args.storageId,
			mediaType: args.mediaType,
			byteSize: args.byteSize,
			sha256: args.sha256,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const deleteBoardImage = internalMutation({
	args: { imageId: v.id("whiteboardImages") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.imageId);
		if (!row) return;
		try {
			await ctx.storage.delete(row.storageId);
		} catch {
			// ignore
		}
		await ctx.db.delete(args.imageId);
	},
});

/** Main sync entry point — scheduled from `whiteboards.updateScene`. */
export const syncBoardImages = internalAction({
	args: { whiteboardId: v.id("whiteboards") },
	handler: async (ctx, args) => {
		const board = await ctx.runQuery(
			internal.ai.toolQueries.getWhiteboardById,
			{ whiteboardId: args.whiteboardId },
		);
		if (!board) return { synced: 0, removed: 0, skipped: 0 };

		// Load full scene JSON (may live in file storage for large boards).
		let sceneJson = board.sceneData ?? "[]";
		if (board.sceneDataStorageId) {
			try {
				const url = await ctx.runQuery(api.files.getUrl, {
					storageId: board.sceneDataStorageId,
				});
				if (url) {
					const res = await fetch(url);
					if (res.ok) sceneJson = await res.text();
				}
			} catch {
				// fall back to inline
			}
		}

		const parsed = await parseSceneImages(sceneJson);
		const existing = await ctx.runQuery(
			internal.ai.whiteboardImageSync.listBoardImages,
			{ whiteboardId: args.whiteboardId },
		);
		const existingByKey = new Map(existing.map((r) => [r.fileKey, r]));

		let synced = 0;
		let skipped = 0;
		for (const img of parsed) {
			const prev = existingByKey.get(img.fileKey);
			if (prev && prev.sha256 === img.sha256) {
				skipped += 1;
				continue;
			}
			const blob = new Blob([img.bytes as BlobPart], { type: img.mediaType });
			const storageId = (await ctx.storage.store(blob)) as Id<"_storage">;
			await ctx.runMutation(internal.ai.whiteboardImageSync.upsertBoardImage, {
				whiteboardId: args.whiteboardId,
				workspaceId: board.workspaceId,
				fileKey: img.fileKey,
				storageId,
				mediaType: img.mediaType,
				byteSize: img.bytes.byteLength,
				sha256: img.sha256,
			});
			synced += 1;
		}

		// Remove rows whose fileKey no longer exists in the scene.
		const parsedKeys = new Set(parsed.map((p) => p.fileKey));
		let removed = 0;
		for (const row of existing) {
			if (parsedKeys.has(row.fileKey)) continue;
			await ctx.runMutation(internal.ai.whiteboardImageSync.deleteBoardImage, {
				imageId: row._id,
			});
			removed += 1;
		}

		return { synced, removed, skipped };
	},
});

// Exported for unit tests.
export const __test__ = { parseSceneImages, sha256Hex, base64ToBytes };
