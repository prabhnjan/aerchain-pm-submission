import Anthropic from "@anthropic-ai/sdk";
(async () => {
  const an = new Anthropic(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } } : {});
  for (const id of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
    try { const m = await an.models.retrieve(id); console.log("Anthropic ok:", m.id); } catch (e) { console.log("Anthropic problem:", id, (e as Error).message.slice(0, 120)); }
  }
})();
