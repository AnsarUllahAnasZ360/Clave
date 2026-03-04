import { ensureHandlers, getBot } from "@/lib/chat/bot";

export const POST = async (req: Request) => {
	await ensureHandlers();
	return getBot().webhooks.gchat(req);
};
