import { env } from "../config/env.js";

/** Make a REST API call to Crisp (adapted from crisp-mcp-server/src/client.ts) */
export async function crispRestCall(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown
): Promise<unknown> {
  const url = `https://api.crisp.chat/v1/website/${env.crispWebsiteId}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${env.crispIdentifier}:${env.crispKey}`).toString("base64")}`,
    "X-Crisp-Tier": "plugin",
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Crisp API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { data?: unknown };
  return json.data ?? json;
}

export interface CrispMessage {
  type: string;
  from: string;
  content: string;
  timestamp: number;
  user?: { nickname?: string };
  fingerprint?: number;
}

export interface CrispMeta {
  nickname?: string;
  email?: string;
  data?: Record<string, unknown>;
  device?: {
    capabilities?: string[];
    geolocation?: { city?: string; country?: string };
  };
  segments?: string[];
}

export interface CrispConversation {
  session_id: string;
  state?: string;
  subject?: string;
  meta?: CrispMeta;
}

/** Get full conversation details */
export async function getConversation(
  sessionId: string
): Promise<CrispConversation> {
  return crispRestCall(`/conversation/${sessionId}`) as Promise<CrispConversation>;
}

/** Get conversation messages (last page) */
export async function getMessages(
  sessionId: string
): Promise<CrispMessage[]> {
  return crispRestCall(`/conversation/${sessionId}/messages`) as Promise<CrispMessage[]>;
}

/** Get conversation metadata */
export async function getMeta(sessionId: string): Promise<CrispMeta> {
  return crispRestCall(`/conversation/${sessionId}/meta`) as Promise<CrispMeta>;
}

/** Update conversation data (metadata) */
export async function updateConversationData(
  sessionId: string,
  data: Record<string, unknown>
): Promise<void> {
  await crispRestCall(`/conversation/${sessionId}/meta`, "PATCH", { data });
}

/** Post an internal note to the conversation */
export async function postNote(
  sessionId: string,
  content: string
): Promise<void> {
  await crispRestCall(`/conversation/${sessionId}/messages`, "POST", {
    type: "note",
    from: "operator",
    origin: "chat",
    content,
  });
}
