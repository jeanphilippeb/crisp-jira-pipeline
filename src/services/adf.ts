/** Atlassian Document Format (ADF) builders — plain JSON, no library needed. */

type AdfNode = Record<string, unknown>;

export function doc(...content: AdfNode[]): AdfNode {
  return { type: "doc", version: 1, content };
}

export function heading(level: 1 | 2 | 3, text: string): AdfNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

export function paragraph(...inline: AdfNode[]): AdfNode {
  return { type: "paragraph", content: inline };
}

export function text(value: string, marks?: AdfNode[]): AdfNode {
  const node: AdfNode = { type: "text", text: value };
  if (marks?.length) node.marks = marks;
  return node;
}

export function bold(): AdfNode {
  return { type: "strong" };
}

export function link(href: string): AdfNode {
  return { type: "link", attrs: { href } };
}

export function bulletList(...items: AdfNode[]): AdfNode {
  return { type: "bulletList", content: items };
}

export function listItem(...content: AdfNode[]): AdfNode {
  return { type: "listItem", content };
}

export function codeBlock(text: string, language?: string): AdfNode {
  return {
    type: "codeBlock",
    attrs: language ? { language } : {},
    content: [{ type: "text", text }],
  };
}

export function rule(): AdfNode {
  return { type: "rule" };
}

/** Shorthand: bold label + value on one line */
export function labelValue(label: string, value: string): AdfNode {
  return paragraph(
    text(`${label}: `, [bold()]),
    text(value)
  );
}

/** Shorthand: bold label + link */
export function labelLink(
  label: string,
  linkText: string,
  href: string
): AdfNode {
  return paragraph(
    text(`${label}: `, [bold()]),
    text(linkText, [link(href)])
  );
}
