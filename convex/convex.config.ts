import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config";
import rag from "@convex-dev/rag/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp();
app.use(agent);
app.use(prosemirrorSync);
app.use(rag);
app.use(stripe);
app.use(workflow);

export default app;
