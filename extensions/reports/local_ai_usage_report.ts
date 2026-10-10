// Workflow-scope report: shows the private markdown the build step stored. Runs after the workflow finishes.
export const report = {
  name: "@kagarmoe/local-ai-usage-report",
  description: "Private weekly usage detail (markdown) and the public summary (JSON)",
  scope: "workflow",
  labels: ["ai-usage"],
  execute: async (ctx: any) => {
    const step = ctx.stepExecutions.find((s: any) => s.methodName === "build" && s.dataHandles?.length);
    if (!step) return { markdown: "# local-ai-usage\n\nThe build step wrote no data in this run. See the run log.", json: {} };
    const h = step.dataHandles[0];
    const bytes = await ctx.dataRepository.getContent(step.modelType, step.modelId, h.name, h.version);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return { markdown: data.markdown, json: data.public };
  },
};
