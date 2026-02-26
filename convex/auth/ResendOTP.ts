import Resend from "@auth/core/providers/resend";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { Resend as ResendAPI } from "resend";

// Official Convex Auth pattern for OTP generation.
function generateOTP() {
	const random: RandomReader = {
		read(bytes: Uint8Array) {
			crypto.getRandomValues(bytes);
		},
	};
	return generateRandomString(random, "0123456789", 8);
}

// Configurable sender — defaults to Resend sandbox (testing only).
// Set AUTH_EMAIL_FROM on your Convex deployment for production, e.g.:
//   npx convex env set AUTH_EMAIL_FROM "Clave <noreply@goclave.app>"
const FROM_ADDRESS =
	process.env.AUTH_EMAIL_FROM ?? "Clave <onboarding@resend.dev>";

/**
 * Email verification OTP — sent after sign-up to confirm the email address.
 * Uses Resend to deliver an 8-digit numeric code.
 *
 * Requires: AUTH_RESEND_KEY env var (set via `npx convex env set`)
 */
export const ResendOTP = Resend({
	id: "resend-otp",
	apiKey: process.env.AUTH_RESEND_KEY,
	generateVerificationToken: generateOTP,
	async sendVerificationRequest({ identifier: email, provider, token }) {
		const resend = new ResendAPI(provider.apiKey);
		const { error } = await resend.emails.send({
			from: FROM_ADDRESS,
			to: [email],
			subject: `${token} is your Clave verification code`,
			text: `Your verification code is: ${token}\n\nEnter this code in Clave to verify your email address.\nThis code expires in 15 minutes.\n\nIf you did not request this code, you can safely ignore this email.`,
		});
		if (error) {
			console.error("Resend verification email failed:", error);
			throw new Error("Could not send verification email");
		}
	},
});

/**
 * Password reset OTP — sent when a user requests a password reset.
 */
export const ResendOTPPasswordReset = Resend({
	id: "resend-otp-password-reset",
	apiKey: process.env.AUTH_RESEND_KEY,
	generateVerificationToken: generateOTP,
	async sendVerificationRequest({ identifier: email, provider, token }) {
		const resend = new ResendAPI(provider.apiKey);
		const { error } = await resend.emails.send({
			from: FROM_ADDRESS,
			to: [email],
			subject: "Reset your Clave password",
			text: `Your password reset code is: ${token}\n\nEnter this code in Clave along with your new password.\nThis code expires in 15 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.`,
		});
		if (error) {
			console.error("Resend password reset email failed:", error);
			throw new Error("Could not send password reset email");
		}
	},
});
