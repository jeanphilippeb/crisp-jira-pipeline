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

/** Create a Jira issue in the JUR project */
export async function createIssue(
  fields: JiraIssueFields
): Promise<JiraCreateResponse> {
  const response = await fetch(`${JIRA_API_BASE}/issue`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API error ${response.status}: ${text}`);
  }

  return (await response.json()) as JiraCreateResponse;
}
