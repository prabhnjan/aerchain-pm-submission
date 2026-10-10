// Runs the frozen pipeline on the held-out reply (vendor F) alongside the stored 5 vendors.
//   npx tsx --env-file=.env.local scripts/run-heldout.ts [--cached]
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toEvidence } from "@/lib/ingest";
import { extractReply } from "@/lib/extract";
import { buildCells, type VendorInput } from "@/lib/pipeline/normalise";
import { callLog } from "@/lib/ai/claude";
import { LINES, QUESTIONNAIRE } from "@/data/rfx";

(async () => {
  const run = JSON.parse(readFileSync("data/runs/latest.json", "utf8"));
  const ref = JSON.parse(readFileSync("data/reference.json", "utf8"));
  const id = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1] ?? "F";
  const file = readdirSync("data/heldout").find((f) => f.startsWith(`${id}_`))!;
  const out = `evals/heldout/run-${id}.json`;
  const docs = [await toEvidence(file, readFileSync(`data/heldout/${file}`))];
  const extraction = process.argv.includes("--cached") && existsSync(out) ? JSON.parse(readFileSync(out, "utf8")).extraction : await extractReply(id, docs, LINES, QUESTIONNAIRE);
  const replyFiles = readdirSync("data/vendor-replies");
  const inputs: VendorInput[] = await Promise.all(Object.keys(run.vendors).map(async (id) => ({
    vendorId: id, extraction: run.vendors[id].extraction, secondRead: run.vendors[id].secondRead,
    docs: await Promise.all(replyFiles.filter((f) => f.startsWith(`${id}_`)).map((f) => toEvidence(f, readFileSync(join("data/vendor-replies", f))))),
  })));
  inputs.push({ vendorId: id, docs, extraction });
  const { cells, terms } = buildCells(inputs, LINES, ref);
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), extraction, cells: cells.filter((c) => c.vendorId === id), terms: terms.find((t) => t.vendorId === id), aiCalls: callLog }, null, 2));
  console.log(`held-out ${id}: ${callLog.length ? `$${callLog.reduce((s, c) => s + c.costUsd, 0).toFixed(2)}, ${(callLog[0].ms / 1000).toFixed(0)}s` : "cached"}`);
})();
