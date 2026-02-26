import { getBot } from "@/lib/chat/bot";

export const POST = (req: Request) => getBot().webhooks.gchat(req);
