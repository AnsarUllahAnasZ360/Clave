import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "../../src/lib/crypto";

// 64-char hex = 32-byte AES-256 key
const VALID_HEX_KEY =
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("crypto", () => {
	beforeEach(() => {
		vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", VALID_HEX_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("encrypt then decrypt round-trips correctly", async () => {
		const plaintext = "ghp_abc123_secret_token";
		const encrypted = await encryptToken(plaintext);
		expect(encrypted).not.toBe(plaintext);
		const decrypted = await decryptToken(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("encrypts empty string", async () => {
		const encrypted = await encryptToken("");
		const decrypted = await decryptToken(encrypted);
		expect(decrypted).toBe("");
	});

	it("produces different ciphertexts for the same input (random IV)", async () => {
		const plaintext = "test-token";
		const enc1 = await encryptToken(plaintext);
		const enc2 = await encryptToken(plaintext);
		expect(enc1).not.toBe(enc2);
	});

	it("throws when GITHUB_TOKEN_ENCRYPTION_KEY is missing", async () => {
		vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", "");
		await expect(encryptToken("test")).rejects.toThrow(
			"GITHUB_TOKEN_ENCRYPTION_KEY environment variable is required",
		);
	});

	it("throws when key is wrong length", async () => {
		vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", "tooshort");
		await expect(encryptToken("test")).rejects.toThrow(
			"must be a 64-character hex string",
		);
	});

	it("decryption fails with wrong key", async () => {
		const encrypted = await encryptToken("secret");
		// Change to a different valid-length key
		const differentKey =
			"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
		vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", differentKey);
		await expect(decryptToken(encrypted)).rejects.toThrow();
	});

	it("handles unicode plaintext", async () => {
		const plaintext = "token-with-emoji-\u{1F600}-and-\u00E9";
		const encrypted = await encryptToken(plaintext);
		const decrypted = await decryptToken(encrypted);
		expect(decrypted).toBe(plaintext);
	});
});
