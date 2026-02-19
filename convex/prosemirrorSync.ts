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

		const { canWrite } = await checkDocumentWriteAccess(
			ctx as Parameters<typeof checkDocumentWriteAccess>[0],
			document,
		);
		if (!canWrite) throw new Error("No write access");
	},
	async onSnapshot(ctx, id, snapshot, _version) {
		await ctx.db.patch(id as Id<"documents">, {
			content: snapshot,
			updatedAt: Date.now(),
		});
	},
});
