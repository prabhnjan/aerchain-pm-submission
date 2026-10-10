// Eval 2: every planted trap must be handled. Cell-level traps are checked by eval 1;
// this checks the vendor-level ones (terms, discounts, questionnaire) and cell traps' expected handling.
//   npx tsx evals/traps.eval.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Truth } from "@/data/truth/types";
import type { Cell } from "@/lib/pipeline/types";
import type { VendorTerms } from "@/lib/pipeline/normalise";
import type { QuestionnaireResult } from "@/lib/questionnaire";

const ROOT = process.cwd();
const truth: Truth = JSON.parse(readFileSync(join(ROOT, "data", "truth", "truth.json"), "utf8"));
const run = JSON.parse(readFileSync(join(ROOT, "data", "runs", "latest.json"), "utf8"));
const cells: Cell[] = run.cells;
const terms: VendorTerms[] = run.terms;
const q: QuestionnaireResult[] = run.questionnaire;
const T = (v: string) => terms.find((t) => t.vendorId === v)!;
const cell = (v: string, l: string) => cells.find((c) => c.vendorId === v && c.lineId === l)!;
const visible = (c: Cell) => ["needs_review", "carried", "missing"].includes(c.status);
const converted = (c: Cell) => c.conversion.length > 0;

const checks: Record<string, () => [boolean, string]> = {
  T01: () => { const ls = truth.traps.find((t) => t.id === "T01")!.lineIds; const ok = ls.every((l) => converted(cell("A", l)) && Math.abs((cell("A", l).inrPerPiece ?? 0) - (truth.cells.find((c) => c.vendorId === "A" && c.lineId === l)!.inrPerPiece ?? -1)) < 0.03); return [ok, "per-100 prices converted and shown"]; },
  T02: () => [visible(cell("A", "PK-PAD-028")), "unit-less per-100 price flagged"],
  T03: () => [["PK-DCT-021", "PK-DCT-022", "PK-DCT-023"].every((l) => cell("A", l).status === "missing" && cell("A", l).inrPerPiece == null), "3 missing lines shown as not quoted, never 0"],
  T04: () => [T("A").flags.some((f) => /GST 12%/.test(f)), "stale GST 12% flagged"],
  T05: () => [cells.filter((c) => c.vendorId === "B").every((c) => c.conversion.some((s) => s.startsWith("USD"))), "USD converted at the stated rate, shown on every cell"],
  T06: () => [T("B").discounts.some((d) => d.percent === 3 && /5\s*MT/i.test(d.condition)), "footnote discount found as a condition, not baked in"],
  T07: () => [T("C").freight.kind === "extra_stated" && T("C").freight.inrPerKg === 2.1, "ex-works freight ₹2.10/kg read from prose"],
  T08: () => [T("C").tooling.platePerColourInr === 4500 && T("C").tooling.diePerItemInr === 18000, "plate and die charges read from prose"],
  T09: () => [["PK-SHP-001", "PK-SHP-004"].every((l) => cell("C", l).checks.some((k) => k.id === "spec_deviation" && !k.ok)), "GSM downgrade flagged"],
  T10: () => [T("C").flags.some((f) => /7 days/.test(f)), "7-day validity flagged"],
  T11: () => [["PK-SHP-009", "PK-SHP-014"].every((l) => visible(cell("D", l))), "smudged digits flagged"],
  T12: () => [truth.traps.find((t) => t.id === "T12")!.lineIds.every((l) => cell("D", l).status === "missing"), "6 lines not on the rate card shown as missing"],
  T13: () => [cells.filter((c) => c.vendorId === "D" && c.inrPerPiece != null).length === 24, "24 rate-card items matched to RFx lines by name and size"],
  T14: () => [q.find((x) => x.vendorId === "D")?.clears === "no" && /expir/i.test(JSON.stringify(q.find((x) => x.vendorId === "D")!.verdicts)), "expired ISO certificate caught from the attachment"],
  T15: () => [truth.traps.find((t) => t.id === "T15")!.lineIds.every((l) => cell("E", l).conversion.some((s) => s.includes("/kg"))), "per-kg rates converted via spec box weight"],
  T16: () => [visible(cell("E", "PK-SHP-006")), "'same as last year' lines marked carried or flagged"],
  T17: () => [T("E").freight.kind === "extra_unknown" && cells.filter((c) => c.vendorId === "E" && c.inrPerPiece != null).every((c) => !!c.landedRange), "unknown freight → landed range"],
  T18: () => [truth.traps.find((t) => t.id === "T18")!.lineIds.every((l) => visible(cell("E", l))), "ambiguous scope lines flagged"],
  T19: () => [q.find((x) => x.vendorId === "E")?.clears === "not_answered", "unanswered questionnaire → not cleared"],
  T20: () => [q.find((x) => x.vendorId === "C")?.clears === "no", "C fails must-haves"],
  T21: () => [visible(cell("C", "PK-SHP-020")), "22% outlier flagged"],
};
const rows = truth.traps.map((t) => { const [ok, what] = checks[t.id]?.() ?? [false, "no check"]; return { id: t.id, vendor: t.vendorId, trap: t.what, handled: ok, expected: what }; });
for (const r of rows) console.log(`${r.handled ? "✓" : "✗"} ${r.id} ${r.vendor}  ${r.trap}  →  ${r.expected}`);
const handled = rows.filter((r) => r.handled).length;
console.log(`\nTraps handled: ${handled}/${rows.length}`);
writeFileSync(join(ROOT, "evals", "results-traps.json"), JSON.stringify({ handled, total: rows.length, rows }, null, 2));
