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
  customfield_10072?: string[]; // Company name
  customfield_11521?: { id: string }[]; // Module
  customfield_11901?: { id: string }[]; // Tech category
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
