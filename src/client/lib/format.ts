export const HASH_PREFIX_LEN = 12;

/** Truncate a 64-char SHA-256 hex to a UI-friendly prefix. Display only. */
export function shortHash(hash: string): string {
	return hash.slice(0, HASH_PREFIX_LEN);
}
