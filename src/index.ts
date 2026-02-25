import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { handleCrispWebhook } from "./handlers/webhook.js";

const app = new Hono();

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Crisp webhook
app.post("/webhooks/crisp", async (c) => {
  try {
    return await handleCrispWebhook(c);
  } catch (err) {
    console.error("[webhook] Error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

const port = env.port;
console.log(`crisp-jira-pipeline listening on :${port}`);
serve({ fetch: app.fetch, port });
