/**
 * AES-256-GCM encryption utilities.
 * Server-side only — never import this from client components.
 */

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const KEY_LENGTH = 32; // 256-bit key

function getEncryptionKey(
	envVarName = "GITHUB_TOKEN_ENCRYPTION_KEY",
): string {
	const key = process.env[envVarName];
	if (!key) {
		throw new Error(`${envVarName} environment variable is required`);
	}
	if (key.length !== KEY_LENGTH * 2) {
		throw new Error(
			`${envVarName} must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes)`,
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
export async function encryptToken(
	plaintext: string,
	envVarName?: string,
): Promise<string> {
	const hexKey = getEncryptionKey(envVarName);
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
 * Create a signed OAuth state string (payload.base64url.signature).
 * Uses HMAC-SHA256 with client secret. No cookie needed.
 */
export async function signOAuthState(
	payload: Record<string, string>,
	secret: string,
): Promise<string> {
	const payloadStr = JSON.stringify(payload);
	const payloadB64 = Buffer.from(payloadStr).toString("base64url");
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payloadB64),
	);
	const sigB64 = Buffer.from(sig).toString("base64url");
	return `${payloadB64}.${sigB64}`;
}

/**
 * Verify and decode a signed OAuth state string.
 */
export async function verifyOAuthState(
	signedState: string,
	secret: string,
): Promise<Record<string, string>> {
	const dot = signedState.lastIndexOf(".");
	if (dot === -1) throw new Error("Invalid state format");
	const payloadB64 = signedState.slice(0, dot);
	const sigB64 = signedState.slice(dot + 1);
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const sig = Uint8Array.from(Buffer.from(sigB64, "base64url"));
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		sig,
		new TextEncoder().encode(payloadB64),
	);
	if (!valid) throw new Error("Invalid state signature");
	return JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as Record<
		string,
		string
	>;
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext back to plaintext.
 */
export async function decryptToken(
	encrypted: string,
	envVarName?: string,
): Promise<string> {
	const hexKey = getEncryptionKey(envVarName);
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
