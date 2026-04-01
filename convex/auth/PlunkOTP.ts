import Resend from "@auth/core/providers/resend";
import {
	generateRandomString,
	type RandomReader,
} from "@oslojs/crypto/random";
import { sendEmail } from "../email";

// Official Convex Auth pattern for OTP generation.
function generateOTP() {
	const random: RandomReader = {
		read(bytes: Uint8Array) {
			crypto.getRandomValues(bytes);
		},
	};
	return generateRandomString(random, "0123456789", 8);
}

/**
 * Email verification OTP — sent after sign-up to confirm the email address.
 * Uses self-hosted Plunk to deliver an 8-digit numeric code.
 *
 * Requires: PLUNK_SECRET_KEY env var (set via `npx convex env set`)
 */
export const PlunkOTP = Resend({
	id: "plunk-otp",
	apiKey: process.env.PLUNK_SECRET_KEY,
	generateVerificationToken: generateOTP,
	async sendVerificationRequest({ identifier: email, token }) {
		await sendEmail({
			to: email,
			subject: `${token} is your Clave verification code`,
			body: `Your verification code is: ${token}\n\nEnter this code in Clave to verify your email address.\nThis code expires in 15 minutes.\n\nIf you did not request this code, you can safely ignore this email.`,
		});
	},
});

/**
 * Password reset OTP — sent when a user requests a password reset.
 */
export const PlunkOTPPasswordReset = Resend({
	id: "plunk-otp-password-reset",
	apiKey: process.env.PLUNK_SECRET_KEY,
	generateVerificationToken: generateOTP,
	async sendVerificationRequest({ identifier: email, token }) {
		await sendEmail({
			to: email,
			subject: "Reset your Clave password",
			body: `Your password reset code is: ${token}\n\nEnter this code in Clave along with your new password.\nThis code expires in 15 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.`,
		});
	},
});
