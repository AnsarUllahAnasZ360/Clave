/** Convex document fields must stay under ~1 MiB; keep inline JSON under this UTF-8 size. */
export const MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES = 900_000;

export function utf8ByteLength(s: string): number {
	return new TextEncoder().encode(s).length;
}
