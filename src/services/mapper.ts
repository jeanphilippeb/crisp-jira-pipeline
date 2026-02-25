import type { JiraIssueFields } from "../clients/jira.js";
import type { TriggerSegment } from "../config/segment-mapping.js";
import { resolveModules } from "../config/segment-mapping.js";
import type { EnrichedData } from "./enrichment.js";
import * as adf from "./adf.js";

/** Normalize company name into a safe Jira label */
function companyLabel(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build ADF description for a Bug ticket */
function buildBugDescription(data: EnrichedData): unknown {
  const nodes: ReturnType<typeof adf.heading>[] = [
    adf.heading(2, "Bug Report (via Crisp)"),
    adf.labelValue("Reporter", `${data.customerName} (${data.customerEmail})`),
    adf.labelValue("Company", data.companyName || "Unknown"),
    adf.labelLink("Crisp Conversation", "View in Crisp", data.conversationUrl),
    adf.labelValue("Date Reported", new Date().toISOString().slice(0, 10)),
    adf.rule(),
    adf.heading(3, "Description"),
    adf.paragraph(
      adf.text(data.conversation.subject || "Bug reported via customer support")
    ),
    adf.heading(3, "Conversation Excerpt"),
    adf.codeBlock(data.transcript || "(no messages)"),
    adf.heading(3, "Session Recording"),
  ];

  if (data.jamLinks.length > 0) {
    for (let i = 0; i < data.jamLinks.length; i++) {
      const label = data.jamLinks.length === 1
        ? "Jam Recording"
        : `Jam Recording #${i + 1}`;
      nodes.push(
        adf.paragraph(
          adf.text(`\uD83C\uDF53 ${label}: `, [adf.bold()]),
          adf.text("View full session replay", [adf.link(data.jamLinks[i])])
        )
      );
    }
    nodes.push(
      adf.paragraph(
        adf.text("(Includes: console logs, network requests, user actions, device info)")
      )
    );
  } else {
    nodes.push(
      adf.paragraph(adf.text("No Jam recording attached.")),
      adf.paragraph(
        adf.text(
          "Consider asking the customer to use Jam for detailed reproduction steps."
        )
      )
    );
  }

  nodes.push(adf.heading(3, "Environment"));
  const envItems: ReturnType<typeof adf.listItem>[] = [];
  if (data.geolocation) {
    envItems.push(
      adf.listItem(adf.paragraph(adf.text(`Geolocation: ${data.geolocation}`)))
    );
  }
  if (envItems.length > 0) {
    nodes.push(adf.bulletList(...envItems));
  } else {
    nodes.push(adf.paragraph(adf.text("(not available)")));
  }

  nodes.push(adf.rule());
  nodes.push(
    adf.paragraph(
      adf.text(`Auto-created from Crisp conversation. Segments: ${data.segments.join(", ")}`, [
        { type: "em" } as ReturnType<typeof adf.bold>,
      ])
    )
  );

  return adf.doc(...nodes);
}

/** Build ADF description for an Improvement ticket */
function buildImprovementDescription(
  data: EnrichedData,
  moduleNames: string[]
): unknown {
  const nodes: ReturnType<typeof adf.heading>[] = [
    adf.heading(2, "Feature Request (via Crisp)"),
    adf.labelValue("Requested by", `${data.customerName} (${data.customerEmail})`),
    adf.labelValue("Company", data.companyName || "Unknown"),
    adf.labelLink("Crisp Conversation", "View in Crisp", data.conversationUrl),
    adf.labelValue("Date Requested", new Date().toISOString().slice(0, 10)),
    adf.rule(),
    adf.heading(3, "Request Summary"),
    adf.paragraph(
      adf.text(
        data.conversation.subject || "Feature request from customer support"
      )
    ),
    adf.heading(3, "Customer Context"),
    adf.codeBlock(data.transcript || "(no messages)"),
    adf.heading(3, "Affected Module(s)"),
    adf.paragraph(
      adf.text(
        moduleNames.length > 0
          ? moduleNames.join(", ")
          : "Not specified — needs grooming"
      )
    ),
    adf.rule(),
    adf.paragraph(
      adf.text(
        `Auto-created from Crisp conversation. Segments: ${data.segments.join(", ")}`,
        [{ type: "em" } as ReturnType<typeof adf.bold>]
      )
    ),
    adf.paragraph(
      adf.text("Module and Tech Category to be refined during grooming.", [
        { type: "em" } as ReturnType<typeof adf.bold>,
      ])
    ),
  ];

  return adf.doc(...nodes);
}

/** Map enriched data → Jira issue fields */
export function buildJiraFields(
  data: EnrichedData,
  trigger: { segment: string; config: TriggerSegment }
): JiraIssueFields {
  const modules = resolveModules(data.segments);
  const isBug = trigger.config.jiraIssueType === "Bug";

  const prefix = isBug ? "[Crisp] Bug" : "[Crisp] Request";
  const summary = `${prefix}: ${data.summary}`;

  const labels = ["crisp-auto"];

  if (isBug) {
    // Bug ticket
    if (data.companyName) {
      const cl = companyLabel(data.companyName);
      if (cl) labels.push(cl);
    }

    return {
      project: { key: trigger.config.jiraProject },
      issuetype: { id: trigger.config.jiraIssueTypeId },
      summary,
      description: buildBugDescription(data),
      labels,
      priority: { id: trigger.config.jiraPriorityId },
    };
  }

  // Improvement ticket
  const company = data.companyName || "Unknown";
  if (!data.companyName) labels.push("needs-grooming");
  if (modules.length === 0) labels.push("needs-grooming");
  // Dedupe
  const uniqueLabels = [...new Set(labels)];

  const fields: JiraIssueFields = {
    project: { key: trigger.config.jiraProject },
    issuetype: { id: trigger.config.jiraIssueTypeId },
    summary,
    description: buildImprovementDescription(data, modules.map((m) => m.name)),
    labels: uniqueLabels,
    priority: { id: trigger.config.jiraPriorityId },
    customfield_10072: [company],
  };

  if (modules.length > 0) {
    fields.customfield_11521 = modules.map((m) => ({ id: m.id }));
  }
  // Tech category left empty (BR-004) — PM fills during grooming

  return fields;
}
