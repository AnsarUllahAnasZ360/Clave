import { NextResponse } from "next/server";

export async function POST(request: Request) {
	try {
		const metric = await request.json();
		if (!metric || typeof metric !== "object") {
			return NextResponse.json(
				{ ok: false, error: "Invalid payload" },
				{ status: 400 },
			);
		}

		console.info("web-vitals", JSON.stringify(metric));
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Failed to parse web vitals payload", error);
		return NextResponse.json(
			{ ok: false, error: "Invalid JSON" },
			{ status: 400 },
		);
	}
}
