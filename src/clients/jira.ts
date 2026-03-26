import { env } from "../config/env.js";

const JIRA_API_BASE = `https://api.atlassian.com/ex/jira/${env.jiraCloudId}/rest/api/3`;

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.jiraEmail}:${env.jiraApiToken}`).toString("base64")}`;
}

export interface JiraIssueFields {
  project: { key: string };
  issuetype: { id: string };
  summary: string;
  description?: unknown; // ADF document
  labels?: string[];
  priority?: { id: string };
  // Custom fields
  customfield_10072?: string[]; // Company name (labels) — JUR
  customfield_11521?: { id: string }[]; // Module (multicheckboxes) — JUR/JENG
  customfield_11901?: { id: string }[]; // Tech category (multicheckboxes) — JUR
  customfield_11404?: { accountId: string }[]; // Product design owner — JUR
  // JTCS required fields
  customfield_11972?: { id: string }; // Module (select) — JTCS
  customfield_12155?: { id: string }; // Ticket type (select) — JTCS
  customfield_12157?: unknown;        // Which existing config — JTCS (ADF)
  customfield_12357?: unknown;        // Acceptance Criteria — JTCS (ADF)
  duedate?: string;                   // Due date (YYYY-MM-DD) — JTCS
  [key: string]: unknown; // Allow additional custom fields
}

export interface JiraCreateResponse {
  id: string;
  key: string;
  self: string;
}

/** Create a Jira issue */
export async function createIssue(
  fields: JiraIssueFields
): Promise<JiraCreateResponse> {
  const payload = { fields };
  console.log("[jira] Creating issue in project", fields.project.key, "with type", fields.issuetype.id);
  console.log("[jira] Full payload:", JSON.stringify(payload, null, 2));

  const response = await fetch(`${JIRA_API_BASE}/issue`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[jira] API error", response.status, "for project", fields.project.key);
    console.error("[jira] Error response:", text);
    console.error("[jira] Payload was:", JSON.stringify(payload, null, 2));
    throw new Error(`Jira API error ${response.status}: ${text}`);
  }

  const result = (await response.json()) as JiraCreateResponse;
  console.log("[jira] Issue created:", result.key);
  return result;
}
