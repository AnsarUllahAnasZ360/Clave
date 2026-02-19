/**
 * @deprecated Avatar URLs are now resolved from the backend via avatarStorageId.
 * This helper exists only for legacy demo data compatibility and returns undefined.
 */
export function getAvatarUrl(_name?: string): string | undefined {
	return undefined;
}
