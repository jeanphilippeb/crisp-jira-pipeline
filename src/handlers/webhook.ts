import type { Context } from "hono";
import { resolveTrigger } from "../config/segment-mapping.js";
import { enrichConversation } from "../services/enrichment.js";
import { hasExistingTicket, storeTicketLink } from "../services/duplicate-guard.js";
import { buildJiraFields } from "../services/mapper.js";
import { createIssue } from "../clients/jira.js";
import { postNote } from "../clients/crisp.js";
import { env } from "../config/env.js";

interface CrispWebhookPayload {
  event: string;
  data: {
    session_id: string;
    website_id: string;
    segments?: string[];
  };
}

/** Core webhook handler — orchestrates the full pipeline */
export async function handleCrispWebhook(c: Context): Promise<Response> {
  const body = (await c.req.json()) as CrispWebhookPayload;
  console.log("[webhook] Received:", JSON.stringify(body, null, 2));

  // Validate event type
  if (body.event !== "session:set_segments") {
    return c.json({ skipped: true, reason: "irrelevant event" }, 200);
  }

  const { session_id: sessionId, website_id: websiteId, segments } = body.data;
  if (!sessionId || !websiteId) {
    return c.json({ error: "missing session_id or website_id" }, 400);
  }

  // Resolve trigger segment (BR-003: bug priority over feature-request)
  const trigger = resolveTrigger(segments || []);
  if (!trigger) {
    return c.json({ skipped: true, reason: "no trigger segment" }, 200);
  }

  console.log(`[webhook] Trigger: ${trigger.segment} for session ${sessionId}`);

  // Duplicate check (BR-001)
  const existingKey = await hasExistingTicket(sessionId);
  if (existingKey) {
    console.log(`[webhook] Duplicate — ticket ${existingKey} already exists`);
    return c.json({ skipped: true, reason: "duplicate", existingTicket: existingKey }, 200);
  }

  // Enrich conversation data
  const data = await enrichConversation(sessionId, websiteId);

  // Re-verify trigger segment is still present (BR-002)
  if (!data.segments.includes(trigger.segment)) {
    console.log(`[webhook] Segment "${trigger.segment}" removed before processing`);
    return c.json({ skipped: true, reason: "segment removed" }, 200);
  }

  // Build Jira fields
  const fields = buildJiraFields(data, trigger);

  // Create Jira issue
  const issue = await createIssue(fields);
  const ticketUrl = `${env.jiraBaseUrl}/browse/${issue.key}`;
  console.log(`[webhook] Created ${issue.key} → ${ticketUrl}`);

  // Store ticket link in Crisp (BR-001)
  await storeTicketLink(sessionId, issue.key, ticketUrl);

  // Post internal note in Crisp conversation
  const noteContent = [
    `🎫 Jira ticket created: **${issue.key}**`,
    `Type: ${trigger.config.jiraIssueType}`,
    `Link: ${ticketUrl}`,
    "",
    "_Auto-created by Crisp→Jira pipeline_",
  ].join("\n");

  await postNote(sessionId, noteContent);

  return c.json({
    success: true,
    ticket: { key: issue.key, url: ticketUrl },
    trigger: trigger.segment,
  });
}
