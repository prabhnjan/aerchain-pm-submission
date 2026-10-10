import { ask } from "@/lib/analyst";
import { BASE_RUN, buildCtx } from "@/lib/state";
(async () => {
  const q = process.argv.slice(2).join(" ") || "What if we split it, cheapest per line, but only among vendors who cleared the quality questionnaire?";
  const t0 = Date.now();
  const r = await ask(q, [], buildCtx(BASE_RUN, []), BASE_RUN);
  console.log(`Q: ${q}\n\n${r.answer}\n`);
  console.log("artifacts:", r.artifacts.map((a) => `${a.kind}:${a.title}`).join(" | "));
  console.log("tools:", r.trace.map((t) => t.tool).join(" → "));
  console.log("number guard:", JSON.stringify(r.numberGuard), `cost $${r.costUsd}`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
})();
