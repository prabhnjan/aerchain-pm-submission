// Lists which candidate model ids this account can use (no generation, no cost).
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
(async () => {
  const oa = new OpenAI();
  const ids: string[] = [];
  for await (const m of oa.models.list()) ids.push(m.id);
  console.log("OpenAI sol/luna models:", ids.filter((i) => /sol|luna|astra/.test(i)).sort().join(", ") || "(none)");
  const an = new Anthropic();
  for (const id of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
    try { const m = await an.models.retrieve(id); console.log("Anthropic ok:", m.id); } catch (e) { console.log("Anthropic missing:", id, (e as Error).message); }
  }
})();
