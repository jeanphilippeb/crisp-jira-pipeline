function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const env = {
  // Crisp
  crispIdentifier: required("CRISP_IDENTIFIER"),
  crispKey: required("CRISP_KEY"),
  crispWebsiteId: required("CRISP_WEBSITE_ID"),

  // Jira
  jiraEmail: required("JIRA_EMAIL"),
  jiraApiToken: required("JIRA_API_TOKEN"),
  jiraCloudId: required("JIRA_CLOUD_ID"),
  jiraBaseUrl: required("JIRA_BASE_URL"),

  // Server
  port: parseInt(process.env.PORT || "3100", 10),
} as const;
