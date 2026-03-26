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

/** Build ADF description for a CS Config ticket */
function buildCsConfigDescription(data: EnrichedData): unknown {
  const nodes: ReturnType<typeof adf.heading>[] = [
    adf.heading(2, "CS Config / Doc Change Request (via Crisp)"),
    adf.labelValue("Requested by", `${data.customerName} (${data.customerEmail})`),
    adf.labelValue("Company", data.companyName || "Unknown"),
    adf.labelLink("Crisp Conversation", "View in Crisp", data.conversationUrl),
    adf.labelValue("Date Requested", new Date().toISOString().slice(0, 10)),
    adf.rule(),
    adf.heading(3, "Request Summary"),
    adf.paragraph(
      adf.text(data.conversation.subject || "CS config/doc change request from customer")
    ),
    adf.heading(3, "Customer Context"),
    adf.codeBlock(data.transcript || "(no messages)"),
  ];

  if (data.jamLinks.length > 0) {
    nodes.push(adf.heading(3, "Attachments / Session Recordings"));
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
  }

  nodes.push(adf.rule());
  nodes.push(
    adf.paragraph(
      adf.text(`Auto-created from Crisp conversation. Segments: ${data.segments.join(", ")}`, [
        { type: "em" } as ReturnType<typeof adf.bold>,
      ])
    ),
    adf.paragraph(
      adf.text("To be groomed — add details, scope, and acceptance criteria.", [
        { type: "em" } as ReturnType<typeof adf.bold>,
      ])
    )
  );

  return adf.doc(...nodes);
}

/** Map enriched data → Jira issue fields */
export function buildJiraFields(
  data: EnrichedData,
  trigger: { segment: string; config: TriggerSegment }
): JiraIssueFields {
  const modules = resolveModules(data.segments);
  const isBug = trigger.config.jiraIssueType === "Bug";
  const isCsConfig = trigger.segment === "cs-config";

  // CS Config ticket (JTCS)
  if (isCsConfig) {
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    // Company: custom data → email domain fallback
    const emailDomain = data.customerEmail
      ? data.customerEmail.split("@")[1] || ""
      : "";
    const company = data.companyName || emailDomain || "Unknown";

    const subject = data.conversation.subject || "(no subject)";
    const transcript = data.transcript || "(no messages)";
    const jamSection = data.jamLinks.length > 0
      ? `\nRecordings:\n${data.jamLinks.join("\n")}`
      : "";

    // JTCS is team-managed: use only paragraph+text ADF nodes (no codeBlock/rule/heading)
    const descNodes = [
      adf.paragraph(adf.text("CS Config / Doc Change Request — via Crisp", [adf.bold()])),
      adf.paragraph(adf.text(`Reporter: ${data.customerName} (${data.customerEmail})`)),
      adf.paragraph(adf.text(`Company: ${company}`)),
      adf.labelLink("Crisp conversation", "View in Crisp", data.conversationUrl),
      adf.paragraph(adf.text(`Date: ${new Date().toISOString().slice(0, 10)}`)),
      adf.paragraph(adf.text(`Subject: ${subject}`)),
      adf.paragraph(adf.text("Conversation:", [adf.bold()])),
      adf.paragraph(adf.text(transcript)),
    ];
    if (data.jamLinks.length > 0) {
      descNodes.push(adf.paragraph(adf.text("Recordings:", [adf.bold()])));
      for (const link of data.jamLinks) {
        descNodes.push(adf.paragraph(adf.text(link, [adf.link(link)])));
      }
    }
    descNodes.push(
      adf.paragraph(adf.text(`Segments: ${data.segments.join(", ")}`)),
      adf.paragraph(adf.text("⚠️ To be detailed during grooming.", [{ type: "em" } as ReturnType<typeof adf.bold>]))
    );

    return {
      project: { key: trigger.config.jiraProject },
      issuetype: { id: trigger.config.jiraIssueTypeId },
      summary: `[Crisp] CS Config — ${company}`,
      description: adf.doc(...descNodes),
      labels: ["crisp", companyLabel(company)].filter(Boolean),
      duedate: dueDate,
      // Required custom fields — to be refined during grooming
      customfield_11972: { id: "12082" }, // Module = "Config"
      customfield_12155: { id: "12201" }, // Ticket type = "Others"
      // These textarea fields require ADF despite schema showing "type: string"
      customfield_12157: adf.doc(
        adf.paragraph(adf.text(`Company: ${company}`)),
        adf.paragraph(adf.text(`Subject: ${subject}`)),
        adf.paragraph(adf.text("⚠️ To be detailed during grooming.", [{ type: "em" } as ReturnType<typeof adf.bold>]))
      ),
      customfield_12357: adf.doc(
        adf.paragraph(adf.text("To be defined during grooming."))
      ),
    };
  }

  const prefix = isBug ? "[Crisp] Bug" : "[Crisp] Request";
  const summary = `${prefix}: ${data.summary}`;

  const labels = ["crisp-auto"];

  if (isBug) {
    // Bug ticket
    if (data.companyName) {
      const cl = companyLabel(data.companyName);
      if (cl) labels.push(cl);
    }

    const bugFields: JiraIssueFields = {
      project: { key: trigger.config.jiraProject },
      issuetype: { id: trigger.config.jiraIssueTypeId },
      summary,
      description: buildBugDescription(data),
      labels,
    };
    // Only include priority if the project supports it
    if (trigger.config.jiraPriorityId) {
      bugFields.priority = { id: trigger.config.jiraPriorityId };
    }
    return bugFields;
  }

  // Improvement ticket
  const company = data.companyName || "Unknown";
  if (!data.companyName) labels.push("needs-grooming");
  if (modules.length === 0) labels.push("needs-grooming");
  // Dedupe
  const uniqueLabels = [...new Set(labels)];

  // Module is REQUIRED — use resolved modules or fallback to "Operations" (11671)
  const moduleValues =
    modules.length > 0
      ? modules.map((m) => ({ id: m.id }))
      : [{ id: "11671" }]; // Operations as placeholder

  const fields: JiraIssueFields = {
    project: { key: trigger.config.jiraProject },
    issuetype: { id: trigger.config.jiraIssueTypeId },
    summary,
    description: buildImprovementDescription(data, modules.map((m) => m.name)),
    labels: uniqueLabels,
    customfield_10072: [companyLabel(company) || "unknown"],
    // Module — required field (multicheckboxes)
    customfield_11521: moduleValues,
    // Tech category — required field, default to "Ui/UxImprovement" (12005), PM updates during grooming
    customfield_11901: [{ id: "12005" }],
    // Product design owner — must be array with single user (field is isMulti=false but expects array)
    customfield_11404: [{ accountId: "712020:0813430a-47b4-48e5-b86a-87f9c3fe3f38" }],
  };
  // Only include priority if the project supports it
  if (trigger.config.jiraPriorityId) {
    fields.priority = { id: trigger.config.jiraPriorityId };
  }

  return fields;
}
