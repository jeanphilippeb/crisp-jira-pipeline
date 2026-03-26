export interface TriggerSegment {
  jiraProject: string;
  jiraIssueType: "Bug" | "Improvement" | "Task";
  jiraIssueTypeId: string;
  jiraPriority: string;
  jiraPriorityId?: string; // Optional — some projects (JB, JTCS) don't support priority field
}

export interface ModuleSegment {
  id: string;
  name: string;
}

export const TRIGGER_SEGMENTS: Record<string, TriggerSegment> = {
  bug: {
    jiraProject: "JB",
    jiraIssueType: "Bug",
    jiraIssueTypeId: "10869", // JB has no Bug type — using Task (10869)
    jiraPriority: "normal",
    // JB Task type does NOT support priority field — omit it
  },
  "urgent-bug": {
    jiraProject: "JENG",
    jiraIssueType: "Bug",
    jiraIssueTypeId: "10004", // JENG Bug type
    jiraPriority: "urgent",
    jiraPriorityId: "10001",
  },
  "feature-request": {
    jiraProject: "JUR",
    jiraIssueType: "Improvement",
    jiraIssueTypeId: "10867",
    jiraPriority: "Medium",
    jiraPriorityId: "3",
  },
  "cs-config": {
    jiraProject: "JTCS",
    jiraIssueType: "Task",
    jiraIssueTypeId: "10569", // "Configuration tasks" in JTCS
    jiraPriority: "Medium",
    // JTCS does not support priority field — omit jiraPriorityId
  },
};

export const MODULE_SEGMENTS: Record<string, ModuleSegment> = {
  "mod:operations": { id: "11671", name: "Operations" },
  "mod:invoice": { id: "11672", name: "Invoice/Payable" },
  "mod:shipment": { id: "11673", name: "Shipment" },
  "mod:logistics": { id: "11674", name: "Logistics" },
  "mod:payment": { id: "11675", name: "Payment" },
  "mod:documents": { id: "11676", name: "Documents" },
  "mod:emails": { id: "11677", name: "Emails" },
  "mod:master-data": { id: "11678", name: "Master data" },
  "mod:rates": { id: "11679", name: "Rates" },
  "mod:values": { id: "11680", name: "Values/Data (ex: dropdown)" },
  "mod:inventory": { id: "11681", name: "Inventory" },
  "mod:outbound": { id: "11682", name: "Outbound load" },
  "mod:loading": { id: "11683", name: "Loading/Delivery" },
  "mod:hedging": { id: "11684", name: "Hedging" },
  "mod:tracking": { id: "11685", name: "Tracking" },
  "mod:container": { id: "11686", name: "Load/Container" },
  "mod:booking": { id: "12041", name: "Booking" },
};

/** Normalize a segment name: lowercase, trim, underscores → hyphens */
function normalizeSegment(s: string): string {
  return s.trim().toLowerCase().replace(/_/g, "-");
}

/** Resolve trigger from segments. Bug takes priority over feature-request (BR-003). */
export function resolveTrigger(
  segments: string[]
): { segment: string; config: TriggerSegment } | null {
  const normalized = segments.map(normalizeSegment);
  // Priority: urgent-bug > bug > feature-request > cs-config
  for (const key of ["urgent-bug", "bug", "feature-request", "cs-config"]) {
    if (normalized.includes(key)) {
      return { segment: key, config: TRIGGER_SEGMENTS[key] };
    }
  }
  return null;
}

/** Extract module segments → Jira module option IDs */
export function resolveModules(
  segments: string[]
): { id: string; name: string }[] {
  return segments
    .filter((s) => s in MODULE_SEGMENTS)
    .map((s) => MODULE_SEGMENTS[s]);
}
