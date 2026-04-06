/**
 * Stable React keys for static skeleton placeholder lists.
 * Using these avoids lint/noArrayIndexKey on `Array.from({ length: n }).map((_, i) => ...)`.
 */
export const SKELETON_KEYS_4 = ["s0", "s1", "s2", "s3"] as const;
export const SKELETON_KEYS_6 = ["s0", "s1", "s2", "s3", "s4", "s5"] as const;
export const SKELETON_KEYS_8 = [
	"s0",
	"s1",
	"s2",
	"s3",
	"s4",
	"s5",
	"s6",
	"s7",
] as const;
