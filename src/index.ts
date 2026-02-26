import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { handleCrispWebhook } from "./handlers/webhook.js";

const app = new Hono();

// Global logging middleware — logs ALL incoming requests
app.use("*", async (c, next) => {
  const start = Date.now();
  console.log(`[request] ${c.req.method} ${c.req.path} from ${c.req.header("x-forwarded-for") || "unknown"}`);
  console.log(`[request] Headers: ${JSON.stringify(Object.fromEntries(c.req.raw.headers))}`);
  await next();
  console.log(`[request] ${c.req.method} ${c.req.path} → ${c.res.status} (${Date.now() - start}ms)`);
});

// Health check — version helps verify deployment
const BUILD_VERSION = "v4-field-formats";
app.get("/health", (c) => c.json({ status: "ok", version: BUILD_VERSION }));

// Crisp webhook handler (shared)
const webhookHandler = async (c: import("hono").Context) => {
  try {
    return await handleCrispWebhook(c);
  } catch (err) {
    console.error("[webhook] Error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
};

// Crisp webhook — primary route
app.post("/webhooks/crisp", webhookHandler);

// Crisp webhook — alias (Crisp may send to "/" depending on plugin config)
app.post("/", webhookHandler);

// Catch-all — log any unexpected routes
app.all("*", (c) => {
  console.log(`[404] Unmatched route: ${c.req.method} ${c.req.path}`);
  return c.json({ error: "not found", path: c.req.path }, 404);
});

const port = env.port;
console.log(`crisp-jira-pipeline listening on :${port}`);
serve({ fetch: app.fetch, port });
