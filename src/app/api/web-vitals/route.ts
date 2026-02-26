import { NextResponse } from "next/server";

type WebVitalsPayload = {
	id: string;
	name: string;
	value: number;
	rating?: string;
	delta?: number;
	navigationType?: string;
	path?: string;
	url?: string;
	timestamp?: number;
};

const SHOULD_LOG_WEB_VITALS = process.env.WEB_VITALS_LOG === "true";

function isValidWebVitalsPayload(value: unknown): value is WebVitalsPayload {
	if (!value || typeof value !== "object") return false;
	const payload = value as Record<string, unknown>;
	return (
		typeof payload.id === "string" &&
		typeof payload.name === "string" &&
		typeof payload.value === "number"
	);
}

export async function POST(request: Request) {
	try {
		const metric = await request.json();
		if (!isValidWebVitalsPayload(metric)) {
			return NextResponse.json(
				{ ok: false, error: "Invalid payload" },
				{ status: 400 },
			);
		}

		if (SHOULD_LOG_WEB_VITALS) {
			console.info(
				"web-vitals",
				JSON.stringify({
					id: metric.id,
					name: metric.name,
					value: metric.value,
					path: metric.path,
					timestamp: metric.timestamp,
				}),
			);
		}

		return new NextResponse(null, { status: 204 });
	} catch (error) {
		console.error("Failed to parse web vitals payload", error);
		return NextResponse.json(
			{ ok: false, error: "Invalid JSON" },
			{ status: 400 },
		);
	}
}
