// NOTE: This module is intentionally retained for legacy v1 document support.
// PublicDocumentView uses api.prosemirrorSync.getSnapshot to load shared
// documents that were created before the Yjs (v2) migration and have no
// content snapshot stored directly on the documents table. The
// @convex-dev/prosemirror-sync package and convex.config.ts registration
// must remain until all v1 documents are migrated or purged.
import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { components } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { checkDocumentReadAccess, checkDocumentWriteAccess } from "./lib/auth";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

export const {
	getSnapshot,
	submitSnapshot,
	latestVersion,
	getSteps,
	submitSteps,
} = prosemirrorSync.syncApi<DataModel>({
	async checkRead(ctx, id) {
		const doc = await ctx.db.get(id as Id<"documents">);
		if (!doc) throw new Error("Document not found");
		const document = doc as {
			_id: Id<"documents">;
			workspaceId: Id<"workspaces">;
			visibility?: string;
			deletedAt?: number;
		};
		if (document.deletedAt) throw new Error("Document has been deleted");

		// Fast path: public documents are readable by anyone
		if (document.visibility === "public") return;

		const { canRead } = await checkDocumentReadAccess(
			ctx as Parameters<typeof checkDocumentReadAccess>[0],
			document,
		);
		if (!canRead) throw new Error("No read access");
	},
	async checkWrite(ctx, id) {
		const doc = await ctx.db.get(id as Id<"documents">);
		if (!doc) throw new Error("Document not found");
		const document = doc as {
			_id: Id<"documents">;
			workspaceId: Id<"workspaces">;
			visibility?: string;
			defaultPermission?: string;
			deletedAt?: number;
		};
		if (document.deletedAt) throw new Error("Document has been deleted");

		// Fast path: public documents with edit permission are writable by anyone.
		// This avoids calling getAuthUserId which may not work correctly in the
		// prosemirror-sync component context for unauthenticated users.
		if (
			document.visibility === "public" &&
			document.defaultPermission === "edit"
		) {
			return;
		}

		const { canWrite } = await checkDocumentWriteAccess(
			ctx as Parameters<typeof checkDocumentWriteAccess>[0],
			document,
		);
		if (!canWrite)
			throw new Error(
				`[v2] No write access: vis=${document.visibility} perm=${document.defaultPermission}`,
			);
	},
	async onSnapshot(ctx, id, snapshot, _version) {
		await ctx.db.patch(id as Id<"documents">, {
			content: snapshot,
			updatedAt: Date.now(),
		});
	},
});
