import type { Context } from "hono";
import { resolveTrigger } from "../config/segment-mapping.js";
import { enrichConversation } from "../services/enrichment.js";
import { hasExistingTicket, storeTicketLink } from "../services/duplicate-guard.js";
import { buildJiraFields } from "../services/mapper.js";
import { createIssue } from "../clients/jira.js";
import { postNote } from "../clients/crisp.js";
import { env } from "../config/env.js";

/**
 * In-memory lock to prevent duplicate ticket creation from rapid webhook retries.
 * Key = sessionId, value = timestamp when processing started.
 * Entries are cleaned up after 5 minutes.
 */
const processingLock = new Map<string, number>();
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

function acquireLock(sessionId: string): boolean {
  const now = Date.now();
  const existing = processingLock.get(sessionId);
  if (existing && now - existing < LOCK_TTL_MS) {
    return false; // Already being processed
  }
  processingLock.set(sessionId, now);
  // Cleanup old entries
  for (const [key, ts] of processingLock) {
    if (now - ts > LOCK_TTL_MS) processingLock.delete(key);
  }
  return true;
}

/** Core webhook handler — orchestrates the full pipeline */
export async function handleCrispWebhook(c: Context): Promise<Response> {
  // Log raw body for debugging payload format
  const rawBody = await c.req.text();
  console.log("[webhook] ===== RAW BODY START =====");
  console.log(rawBody);
  console.log("[webhook] ===== RAW BODY END =====");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[webhook] Failed to parse JSON body");
    return c.json({ error: "invalid JSON" }, 400);
  }

  console.log("[webhook] Parsed event:", body.event);
  console.log("[webhook] Top-level keys:", Object.keys(body));

  // Accept both "session:set_segments" and other segment-related events
  const event = body.event as string;
  if (!event?.includes("segment")) {
    console.log(`[webhook] Skipping non-segment event: ${event}`);
    return c.json({ skipped: true, reason: "irrelevant event", event }, 200);
  }

  // Flexible payload extraction — Crisp may nest data differently
  const data = (body.data || body) as Record<string, unknown>;
  console.log("[webhook] data keys:", Object.keys(data));

  const sessionId = (data.session_id || data.sessionId) as string | undefined;
  const websiteId = (data.website_id || data.websiteId || env.crispWebsiteId) as string;

  if (!sessionId) {
    console.error("[webhook] No session_id found in payload. data =", JSON.stringify(data));
    return c.json({ error: "missing session_id" }, 400);
  }

  console.log(`[webhook] sessionId=${sessionId}, websiteId=${websiteId}`);

  // In-memory lock — prevent concurrent processing of the same session
  if (!acquireLock(sessionId)) {
    console.log(`[webhook] Session ${sessionId} already being processed (in-memory lock)`);
    return c.json({ skipped: true, reason: "already processing" }, 200);
  }

  // Extract segments from webhook payload (multiple possible locations)
  let webhookSegments: string[] = [];
  if (Array.isArray(data.segments)) {
    webhookSegments = data.segments as string[];
  } else if (Array.isArray((data as any).updated_segments)) {
    webhookSegments = (data as any).updated_segments as string[];
  } else if (Array.isArray((data as any).segment)) {
    webhookSegments = [(data as any).segment as string];
  }

  console.log("[webhook] Segments from webhook payload:", webhookSegments);

  // If no segments in webhook payload, fetch them from Crisp API
  if (webhookSegments.length === 0) {
    console.log("[webhook] No segments in webhook, fetching from Crisp API...");
    try {
      const { crispRestCall } = await import("../clients/crisp.js");
      const meta = (await crispRestCall(`/conversation/${sessionId}/meta`)) as any;
      webhookSegments = meta?.segments || [];
      console.log("[webhook] Segments from API:", webhookSegments);
    } catch (err) {
      console.error("[webhook] Failed to fetch segments from API:", err);
    }
  }

  // Resolve trigger segment (BR-003: bug priority over feature-request)
  const trigger = resolveTrigger(webhookSegments);
  if (!trigger) {
    console.log("[webhook] No trigger segment found in:", webhookSegments);
    return c.json({ skipped: true, reason: "no trigger segment", segments: webhookSegments }, 200);
  }

  console.log(`[webhook] Trigger: ${trigger.segment} for session ${sessionId}`);

  // Duplicate check (BR-001) — non-fatal if Crisp API fails
  try {
    const existingKey = await hasExistingTicket(sessionId);
    if (existingKey) {
      console.log(`[webhook] Duplicate — ticket ${existingKey} already exists`);
      return c.json({ skipped: true, reason: "duplicate", existingTicket: existingKey }, 200);
    }
  } catch (err) {
    console.warn("[webhook] Could not check for duplicate (Crisp API error), proceeding:", err);
  }

  // Enrich conversation data
  const enriched = await enrichConversation(sessionId, websiteId);

  console.log("[webhook] Enriched segments:", enriched.segments);
  console.log("[webhook] Webhook segments:", webhookSegments);

  // BR-002: Use EITHER enriched segments OR webhook segments
  const allSegments = [...new Set([...enriched.segments, ...webhookSegments])];
  if (!allSegments.includes(trigger.segment)) {
    console.log(`[webhook] Segment "${trigger.segment}" not found in combined segments:`, allSegments);
    return c.json({ skipped: true, reason: "segment removed" }, 200);
  }

  // Build Jira fields
  const fields = buildJiraFields(enriched, trigger);

  // Create Jira issue
  const issue = await createIssue(fields);
  const ticketUrl = `${env.jiraBaseUrl}/browse/${issue.key}`;
  console.log(`[webhook] Created ${issue.key} → ${ticketUrl}`);

  // Post-creation: store link + note in Crisp (non-fatal if Crisp API fails)
  let crispLinkOk = false;
  let crispNoteOk = false;

  try {
    await storeTicketLink(sessionId, issue.key, ticketUrl);
    crispLinkOk = true;
    console.log("[webhook] Stored ticket link in Crisp metadata");
  } catch (err) {
    console.error("[webhook] Failed to store ticket link in Crisp (non-fatal):", err);
  }

  try {
    const noteContent = [
      `🎫 Jira ticket created: **${issue.key}**`,
      `Type: ${trigger.config.jiraIssueType}`,
      `Link: ${ticketUrl}`,
      "",
      "_Auto-created by Crisp→Jira pipeline_",
    ].join("\n");

    await postNote(sessionId, noteContent);
    crispNoteOk = true;
    console.log("[webhook] Posted internal note in Crisp");
  } catch (err) {
    console.error("[webhook] Failed to post note in Crisp (non-fatal):", err);
  }

  return c.json({
    success: true,
    ticket: { key: issue.key, url: ticketUrl },
    trigger: trigger.segment,
    crispLinkOk,
    crispNoteOk,
  });
}
