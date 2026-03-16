"use node";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Decrypt AES-256-GCM encrypted chat credentials.
 * Uses CHAT_CREDENTIALS_ENCRYPTION_KEY from Convex env.
 */
export async function decryptChatCredentials(
	encrypted: string,
): Promise<string> {
	const hexKey = process.env.CHAT_CREDENTIALS_ENCRYPTION_KEY;
	if (!hexKey) {
		throw new Error(
			"CHAT_CREDENTIALS_ENCRYPTION_KEY environment variable is required",
		);
	}
	if (hexKey.length !== KEY_LENGTH * 2) {
		throw new Error(
			`CHAT_CREDENTIALS_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string`,
		);
	}

	const matches = hexKey.match(/.{1,2}/g);
	if (!matches) throw new Error("Invalid hex key format");
	const keyBytes = new Uint8Array(
		matches.map((byte) => Number.parseInt(byte, 16)),
	);

	const key = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: ALGORITHM },
		false,
		["decrypt"],
	);

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
