// Runs the real pipeline on the demo vendor replies and saves the result.
//   npx tsx scripts/run-pipeline.ts            → fresh AI extraction (costs money)
//   npx tsx scripts/run-pipeline.ts --cached   → reuse the last extraction, re-run code stages only
//   npx tsx scripts/run-pipeline.ts --only=D   → re-extract one vendor, reuse the rest
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { toEvidence } from "@/lib/ingest";
import { ocrPrices } from "@/lib/ingest/ocr";
import { extractReply, secondRead } from "@/lib/extract";
import { buildCells, type Reference, type VendorInput } from "@/lib/pipeline/normalise";
import { callLog } from "@/lib/ai/claude";
import { judgeQuestionnaire, type QuestionnaireResult } from "@/lib/questionnaire";
import { pieceWeightGrams } from "@/lib/domain/spec";
import { LINES, QUESTIONNAIRE } from "@/data/rfx";
import type { ReplyExtraction } from "@/lib/extract/schema";

const ROOT = process.cwd();
const REPLIES = join(ROOT, "data", "vendor-replies");
const RUNS = join(ROOT, "data", "runs");
const ref: Reference = JSON.parse(readFileSync(join(ROOT, "data", "reference.json"), "utf8"));
const args = process.argv.slice(2);
const cached = args.includes("--cached");
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");

async function main() {
  mkdirSync(RUNS, { recursive: true });
  const prev = existsSync(join(RUNS, "latest.json")) ? JSON.parse(readFileSync(join(RUNS, "latest.json"), "utf8")) : null;
  const files = readdirSync(REPLIES);
  const vendorIds = [...new Set(files.map((f) => f.split("_")[0]))].sort();

  const inputs: VendorInput[] = await Promise.all(
    vendorIds.map(async (id) => {
      const docs = await Promise.all(files.filter((f) => f.startsWith(`${id}_`)).map(async (f) => toEvidence(f, readFileSync(join(REPLIES, f)))));
      const reuse = cached || (only && !only.includes(id));
      let extraction: ReplyExtraction;
      let second: ReplyExtraction | undefined;
      if (reuse && prev?.vendors?.[id]) {
        extraction = prev.vendors[id].extraction;
        second = prev.vendors[id].secondRead;
      } else {
        const t0 = Date.now();
        const hard = docs.find((d) => d.kind === "image");
        [extraction, second] = await Promise.all([
          extractReply(id, docs, LINES, QUESTIONNAIRE),
          hard
            ? secondRead(id, hard, LINES, QUESTIONNAIRE).catch((e) => {
                console.log(`  second read for ${id} unavailable: ${(e as Error).message.slice(0, 120)}`);
                return undefined;
              })
            : Promise.resolve(undefined),
        ]);
        console.log(`  extracted ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s${second ? " (+ second read)" : ""}`);
      }
      // Offline OCR for photos: cached in the run so the deployed app needs no OCR runtime.
      for (const d of docs.filter((x) => x.kind === "image" && x.image)) {
        const cachedOcr = prev?.vendors?.[id]?.ocr?.[d.fileName];
        d.ocr = cachedOcr ?? (await ocrPrices(d.image!.base64));
      }
      return { vendorId: id, docs, extraction, secondRead: second };
    }),
  );

  const { cells, terms } = buildCells(inputs, LINES, ref);

  // Questionnaire verdicts (auditor model). Re-judged only for re-extracted vendors.
  const annualTonnes = LINES.reduce((t, l) => t + (pieceWeightGrams(l) * l.annualQty) / 1e6, 0);
  const questionnaire: QuestionnaireResult[] = await Promise.all(
    inputs.map(async (v) => {
      const reuse = cached || (only && !only.includes(v.vendorId));
      const old = prev?.questionnaire?.find((q: QuestionnaireResult) => q.vendorId === v.vendorId);
      if (reuse && old && !args.includes("--rejudge")) return old;
      return judgeQuestionnaire(v.vendorId, v.extraction, v.docs, QUESTIONNAIRE, "2026-10-09", annualTonnes);
    }),
  );
  const out = {
    ranAt: new Date().toISOString(),
    vendors: Object.fromEntries(inputs.map((v) => [v.vendorId, { extraction: v.extraction, secondRead: v.secondRead, files: v.docs.map((d) => d.fileName), ...(v.docs.some((d) => d.ocr) ? { ocr: Object.fromEntries(v.docs.filter((d) => d.ocr).map((d) => [d.fileName, d.ocr])) } : {}) }])),
    cells, terms, questionnaire,
    aiCalls: callLog.length ? callLog : prev?.aiCalls ?? [],
  };
  writeFileSync(join(RUNS, "latest.json"), JSON.stringify(out, null, 2));
  if (callLog.length) writeFileSync(join(RUNS, `run-${Date.now()}.json`), JSON.stringify(out, null, 2));

  console.log("questionnaire:", questionnaire.map((q) => `${q.vendorId}=${q.clears}`).join(" "));
  const by = (s: string) => cells.filter((c) => c.status === s).length;
  console.log(`cells: verified ${by("verified")}, converted ${by("converted")}, needs_review ${by("needs_review")}, carried ${by("carried")}, missing ${by("missing")}`);
  const cost = callLog.reduce((s, c) => s + c.costUsd, 0);
  if (callLog.length) console.log(`AI calls ${callLog.length}, cost $${cost.toFixed(2)}, tokens in ${callLog.reduce((s, c) => s + c.inputTokens, 0)} out ${callLog.reduce((s, c) => s + c.outputTokens, 0)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
