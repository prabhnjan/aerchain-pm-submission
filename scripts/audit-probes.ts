// Probes for the Codex audit's behavioural claims (no AI calls).
import { qualification, capacityFrom } from "@/lib/questionnaire/eligibility";
import { QUESTIONNAIRE as QUESTIONNAIRE_FOR_QUAL } from "@/data/rfx";
import { readFileSync } from "node:fs";
import { LINES } from "@/data/rfx";
import { runScenario, type Ctx } from "@/lib/scenario";
import { buildCells, type VendorInput } from "@/lib/pipeline/normalise";
import { toEvidence } from "@/lib/ingest";

const run = JSON.parse(readFileSync("data/runs/latest.json", "utf8"));
const ref = JSON.parse(readFileSync("data/reference.json", "utf8"));
const ctx: Ctx = { lines: LINES, cells: run.cells, terms: run.terms, history: ref.history, ...qualification(run.questionnaire, QUESTIONNAIRE_FOR_QUAL), capacity: capacityFrom(run.vendors) };

// F05: does max_vendors pick by pre-discount total?
const two = runScenario({ rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 2 }, ctx);
const one = runScenario({ rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 1 }, ctx);
console.log(`F05  ≤2 vendors picks ${two.byVendor.map((b) => b.vendorId).join("+")} → after discounts ₹${two.totalAfterDiscountsInr}; ≤1 vendor (B) → ₹${one.totalAfterDiscountsInr}; ≤2 is ${two.totalAfterDiscountsInr > one.totalAfterDiscountsInr ? "WORSE than ≤1: bug confirmed" : "fine"}`);

// F04: correct number on the wrong SKU. Swap A's prices for two similar-priced lines.
(async () => {
  const docs = await Promise.all(["A_SriVenkatesha_quotation.xlsx", "A_attachment_ISO9001.pdf"].map(async (f) => toEvidence(f, readFileSync(`data/vendor-replies/${f}`))));
  const ex = JSON.parse(JSON.stringify(run.vendors.A.extraction));
  const a = ex.lines.find((l: any) => l.rfx_line_id === "PK-SHP-005");
  const b = ex.lines.find((l: any) => l.rfx_line_id === "PK-SHP-014");
  for (const k of ["source_ref", "source_quote", "price_text", "price_value", "vendor_item_text"]) [a[k], b[k]] = [b[k], a[k]];
  const inputs: VendorInput[] = Object.keys(run.vendors).map((id) => id === "A" ? { vendorId: id, docs, extraction: ex } : { vendorId: id, docs: [], extraction: run.vendors[id].extraction, secondRead: run.vendors[id].secondRead });
  const { cells } = buildCells(inputs, LINES, ref);
  for (const id of ["PK-SHP-005", "PK-SHP-014"]) {
    const c = cells.find((x) => x.vendorId === "A" && x.lineId === id)!;
    console.log(`F04  A ${id}: ₹${c.inrPerPiece} status=${c.status} reasons=${JSON.stringify(c.reasons)}`);
  }
})();

// F06: A fails ONLY the line-scoped food-safe declaration → only A's food lines should move.
{
  const q2 = JSON.parse(JSON.stringify(run.questionnaire));
  const a = q2.find((x: any) => x.vendorId === "A");
  a.verdicts = a.verdicts.map((v: any) => (v.question_id === "Q09" ? { ...v, verdict: "fail" } : v));
  const ctx2: Ctx = { ...ctx, ...qualification(q2, QUESTIONNAIRE_FOR_QUAL) };
  const rule = { rule: "cheapest_per_line", vendorFilter: "cleared_questionnaire" } as const;
  const before = runScenario(rule, ctx).lines;
  const after = runScenario(rule, ctx2).lines;
  const moved = after.filter((x, i) => x.vendorId !== before[i].vendorId).map((x) => x.lineId);
  const food = new Set(LINES.filter((l) => l.foodContact).map((l) => l.id));
  const aKept = after.filter((x) => x.vendorId === "A").map((x) => x.lineId);
  console.log(`F06  A still cleared vendor-wide: ${ctx2.cleared.A}; lines moved off A: ${moved.join(",") || "none"}; all moved are food lines: ${moved.every((m) => food.has(m))}; A keeps non-food: ${aKept.join(",")}`);
}

// F06/F21: capacity limits the award. Shrink B's awardable capacity to 20 t/month.
{
  const ctx3: Ctx = { ...ctx, capacity: { ...ctx.capacity, B: 20 } };
  const r = runScenario({ rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 1 }, ctx3);
  const r2 = runScenario({ rule: "cheapest_per_line", vendorFilter: "cleared_questionnaire" }, ctx3);
  const load = (res: typeof r2, v: string) => res.byVendor.find((b) => b.vendorId === v)?.monthlyTonnes ?? 0;
  console.log(`F21  1-vendor with B capped at 20 t/mo: picks ${r.byVendor.map((b) => b.vendorId).join("+")} (${r.byVendor.map((b) => b.monthlyTonnes).join(",")} t/mo), uncovered ${r.uncoveredLines.length}; vendors used ≤1: ${r.byVendor.length <= 1}`);
  console.log(`F21  VP rule with B capped: B ${load(r2, "B")} t/mo (≤20?) A ${load(r2, "A")} t/mo; moves: ${r2.capacityNotes.length}; total after discounts ₹${r2.totalAfterDiscountsInr}`);
  const r3 = runScenario({ rule: "cheapest_per_line", vendorFilter: "all" }, ctx);
  console.log(`F21  all-vendors rule notes: ${r3.capacityNotes.join(" | ") || "none"}`);
  const r4 = runScenario({ rule: "cheapest_per_line", vendorFilter: "cleared_questionnaire" }, { ...ctx, capacity: { ...ctx.capacity, A: null } });
  console.log(`F06  A capacity unknown under quality rule → excluded: ${JSON.stringify(r4.vendorsExcluded.find((x) => x.vendorId === "A"))}`);
}

// F21 MOQ: read from held-out G's own reply, then award G's lines to G.
{
  const g = JSON.parse(readFileSync("evals/heldout/run-G.json", "utf8"));
  console.log(`F21  MOQ read from G's reply: ${g.terms.moqPcs} ("${g.terms.moqQuote}")`);
  const ctxG: Ctx = { ...ctx, cells: [...ctx.cells, ...g.cells], terms: [...ctx.terms, g.terms], cleared: { ...ctx.cleared, G: "yes" }, capacity: { ...ctx.capacity, G: 100 } };
  const r = runScenario({ rule: "single_vendor", vendorFilter: ["G"], vendorId: "G" }, ctxG);
  console.log(`F21  G-only award MOQ notes: ${r.moqNotes.length}: ${r.moqNotes.join(" | ")}`);
}

// F21 MOQ blocker: an MOQ above a line's whole annual quantity can't be met by ordering less often.
{
  const terms = ctx.terms.map((t) => (t.vendorId === "B" ? { ...t, moqPcs: 22000 } : t));
  const r = runScenario({ rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 1 }, { ...ctx, terms });
  const blockers = r.moqNotes.filter((n) => n.startsWith("BLOCKER"));
  console.log(`F21  B with MOQ 22,000: ${blockers.length} blocker(s): ${blockers.slice(0, 2).join(" | ")}`);
}
