import { getMeta, updateConversationData } from "../clients/crisp.js";

/** Check if a Jira ticket already exists for this conversation (BR-001) */
export async function hasExistingTicket(sessionId: string): Promise<string | null> {
  const meta = await getMeta(sessionId);
  const key = meta.data?.jira_ticket_key;
  return typeof key === "string" && key ? key : null;
}

/** Store the Jira ticket key + URL in Crisp conversation data */
export async function storeTicketLink(
  sessionId: string,
  ticketKey: string,
  ticketUrl: string
): Promise<void> {
  await updateConversationData(sessionId, {
    jira_ticket_key: ticketKey,
    jira_ticket_url: ticketUrl,
  });
}
