import type { CrispMessage } from "../clients/crisp.js";

const JAM_LINK_REGEX = /https:\/\/jam\.dev\/(c|s)\/[a-zA-Z0-9]+/g;

/** Extract all unique jam.dev links from conversation messages (BR-008) */
export function detectJamLinks(messages: CrispMessage[]): string[] {
  const links = new Set<string>();
  for (const msg of messages) {
    if (typeof msg.content !== "string") continue;
    const matches = msg.content.match(JAM_LINK_REGEX);
    if (matches) {
      for (const m of matches) links.add(m);
    }
  }
  return [...links];
}
