import Plunk from "@plunk/node";

/**
 * Shared Plunk email client for all transactional emails.
 * Self-hosted at plunk.zikrainfotech.com.
 *
 * Required env vars (set via `npx convex env set`):
 *   PLUNK_SECRET_KEY  — secret key from Plunk dashboard
 *   PLUNK_API_URL     — self-hosted API URL (e.g. https://plunk.zikrainfotech.com/api/v1)
 *   AUTH_EMAIL_FROM   — sender address (e.g. Clave <noreply@clave.z360.biz>)
 */

function getPlunkClient(): Plunk {
	const secretKey = process.env.PLUNK_SECRET_KEY;
	if (!secretKey) {
		throw new Error("PLUNK_SECRET_KEY is not configured");
	}
	const baseUrl = process.env.PLUNK_API_URL;
	if (baseUrl) {
		return new Plunk(secretKey, { baseUrl });
	}
	return new Plunk(secretKey);
}

function getFromAddress(): string {
	return process.env.AUTH_EMAIL_FROM ?? "Clave <noreply@clave.z360.biz>";
}

/** Parse "Name <email>" format into separate name and email. */
function parseFromAddress(from: string): { name: string; email: string } {
	const match = from.match(/^(.+?)\s*<(.+)>$/);
	if (match) {
		return { name: match[1].trim(), email: match[2].trim() };
	}
	return { name: "Clave", email: from };
}

export async function sendEmail(opts: {
	to: string;
	subject: string;
	body: string;
}): Promise<void> {
	const plunk = getPlunkClient();
	const from = parseFromAddress(getFromAddress());

	const success = await plunk.emails.send({
		to: opts.to,
		subject: opts.subject,
		body: opts.body,
		from: from.email,
		name: from.name,
	});

	if (!success) {
		console.error("Plunk email failed:", {
			to: opts.to,
			subject: opts.subject,
		});
		throw new Error("Could not send email");
	}
}
