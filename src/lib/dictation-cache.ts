/**
 * IndexedDB cache for offline dictation audio recovery.
 *
 * When the user records a dictation while offline, the audio blob is stored
 * here. On reconnect, pending recordings are flushed to the server.
 */

const DB_NAME = "clave-dictation-cache";
const DB_VERSION = 1;
const STORE_NAME = "pending";

interface CachedDictation {
	id: string;
	chunks?: Blob[];
	blob?: Blob;
	mimeType: string;
	duration: number;
	createdAt: number;
}

export function getCachedDictationChunks(entry: CachedDictation): Blob[] {
	if (entry.chunks && entry.chunks.length > 0) {
		return entry.chunks;
	}
	if (entry.blob instanceof Blob) {
		return [entry.blob];
	}
	return [];
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function cacheDictation(
	blobOrChunks: Blob | Blob[],
	mimeType: string,
	duration: number,
): Promise<string> {
	const db = await openDB();
	const id = `dictation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const chunks = Array.isArray(blobOrChunks) ? blobOrChunks : [blobOrChunks];
	const filteredChunks = chunks.filter((chunk) => chunk instanceof Blob);
	const entry: CachedDictation = {
		id,
		chunks: filteredChunks,
		mimeType,
		duration,
		createdAt: Date.now(),
	};
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).put(entry);
		tx.oncomplete = () => resolve(id);
		tx.onerror = () => reject(tx.error);
	});
}

export async function getPendingDictations(): Promise<CachedDictation[]> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const request = tx.objectStore(STORE_NAME).getAll();
		request.onsuccess = () => resolve(request.result as CachedDictation[]);
		request.onerror = () => reject(request.error);
	});
}

export async function removeCachedDictation(id: string): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
