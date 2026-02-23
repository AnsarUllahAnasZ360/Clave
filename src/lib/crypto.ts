/**
 * AES-256-GCM encryption utilities for GitHub OAuth tokens.
 * Server-side only — never import this from client components.
 */

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const KEY_LENGTH = 32; // 256-bit key

function getEncryptionKey(): string {
	const key = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
	if (!key) {
		throw new Error(
			"GITHUB_TOKEN_ENCRYPTION_KEY environment variable is required",
		);
	}
	if (key.length !== KEY_LENGTH * 2) {
		throw new Error(
			`GITHUB_TOKEN_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes)`,
		);
	}
	return key;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
	const matches = hexKey.match(/.{1,2}/g);
	if (!matches) throw new Error("Invalid hex key format");
	const keyBytes = new Uint8Array(
		matches.map((byte) => Number.parseInt(byte, 16)),
	);
	return crypto.subtle.importKey("raw", keyBytes, { name: ALGORITHM }, false, [
		"encrypt",
		"decrypt",
	]);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing IV + ciphertext + auth tag.
 */
export async function encryptToken(plaintext: string): Promise<string> {
	const hexKey = getEncryptionKey();
	const key = await importKey(hexKey);

	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoded = new TextEncoder().encode(plaintext);

	const ciphertext = await crypto.subtle.encrypt(
		{ name: ALGORITHM, iv },
		key,
		encoded,
	);

	// Combine IV + ciphertext (which includes the auth tag in Web Crypto)
	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(ciphertext), iv.length);

	return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext back to plaintext.
 */
export async function decryptToken(encrypted: string): Promise<string> {
	const hexKey = getEncryptionKey();
	const key = await importKey(hexKey);

	const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

	const iv = combined.slice(0, IV_LENGTH);
	const ciphertext = combined.slice(IV_LENGTH);

	const decrypted = await crypto.subtle.decrypt(
		{ name: ALGORITHM, iv },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(decrypted);
}
