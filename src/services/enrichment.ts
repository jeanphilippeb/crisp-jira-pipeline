import {
  getConversation,
  getMessages,
  getMeta,
  type CrispConversation,
  type CrispMessage,
  type CrispMeta,
} from "../clients/crisp.js";
import { detectJamLinks } from "./jam-detector.js";

export interface EnrichedData {
  conversation: CrispConversation;
  messages: CrispMessage[];
  meta: CrispMeta;
  customerName: string;
  customerEmail: string;
  companyName: string;
  conversationUrl: string;
  jamLinks: string[];
  transcript: string;
  summary: string;
  segments: string[];
  browserInfo?: string;
  osInfo?: string;
  geolocation?: string;
}

/** Fetch all conversation data from Crisp and prepare enriched payload */
export async function enrichConversation(
  sessionId: string,
  websiteId: string
): Promise<EnrichedData> {
  const [conversation, messages, meta] = await Promise.all([
    getConversation(sessionId),
    getMessages(sessionId),
    getMeta(sessionId),
  ]);

  const customerName = meta.nickname || meta.email || "Unknown";
  const customerEmail = meta.email || "";
  const data = meta.data || {};
  const companyName =
    (data.company as string) || (data.organization as string) || "";

  const conversationUrl = `https://app.crisp.chat/website/${websiteId}/inbox/${sessionId}/`;

  const jamLinks = detectJamLinks(messages);

  // Build transcript from last 10 messages
  const recentMessages = messages.slice(-10);
  const transcript = recentMessages
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => {
      const time = new Date(m.timestamp).toISOString().slice(0, 16).replace("T", " ");
      const author = m.from === "user" ? (m.user?.nickname || "Customer") : "Operator";
      return `[${time}] ${author}: ${m.content}`;
    })
    .join("\n");

  // Summary: subject → first customer message (80 chars) → fallback (BR-005)
  let summary = conversation.subject || "";
  if (!summary) {
    const firstCustomerMsg = messages.find(
      (m) => m.from === "user" && typeof m.content === "string" && m.content.trim()
    );
    if (firstCustomerMsg) {
      const clean = (firstCustomerMsg.content as string)
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      summary = clean.length > 80 ? clean.slice(0, 77) + "..." : clean;
    }
  }
  if (!summary) {
    summary = "Issue reported via Crisp";
  }

  const segments = meta.segments || conversation.meta?.segments || [];

  // Device info from Crisp meta
  const device = meta.device;
  const geolocation = device?.geolocation
    ? [device.geolocation.city, device.geolocation.country].filter(Boolean).join(", ")
    : undefined;

  return {
    conversation,
    messages,
    meta,
    customerName,
    customerEmail,
    companyName,
    conversationUrl,
    jamLinks,
    transcript,
    summary,
    segments,
    geolocation,
  };
}
