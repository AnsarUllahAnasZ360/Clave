import { after } from "next/server";
import { ensureHandlers, getBot } from "@/lib/chat/bot";

export const maxDuration = 60;

export const POST = async (req: Request) => {
	await ensureHandlers();
	return getBot().webhooks.gchat(req, {
		waitUntil: (task: Promise<unknown>) => after(() => task),
	});
};
