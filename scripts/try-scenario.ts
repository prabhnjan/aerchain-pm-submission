// Quick look at the VP's question on the latest run (no AI).
import { qualification, capacityFrom } from "@/lib/questionnaire/eligibility";
import { QUESTIONNAIRE as QUESTIONNAIRE_FOR_QUAL } from "@/data/rfx";
import { readFileSync } from "node:fs";
import { LINES } from "@/data/rfx";
import { runScenario, robustness, type Ctx } from "@/lib/scenario";
const run = JSON.parse(readFileSync("data/runs/latest.json", "utf8"));
const ref = JSON.parse(readFileSync("data/reference.json", "utf8"));
const ctx: Ctx = { lines: LINES, cells: run.cells, terms: run.terms, history: ref.history,
  ...qualification(run.questionnaire, QUESTIONNAIRE_FOR_QUAL), capacity: capacityFrom(run.vendors) };
const crore = (n: number) => `₹${(n / 1e7).toFixed(3)} cr`;
for (const rule of [
  { rule: "cheapest_per_line", vendorFilter: "cleared_questionnaire" },
  { rule: "cheapest_per_line", vendorFilter: "all" },
  { rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 1 },
] as const) {
  const r = runScenario(rule as any, ctx);
  console.log(`\n${JSON.stringify(rule)}\n total ${crore(r.totalInr)} after discounts ${crore(r.totalAfterDiscountsInr)} | uncovered ${r.uncoveredLines.join(",") || "none"} | unconfirmed used ${r.unconfirmedCellsUsed} | last year same lines ${r.lastYearSameLinesInr ? crore(r.lastYearSameLinesInr) : "-"}`);
  console.log(" by vendor", r.byVendor.map((b) => `${b.vendorId}:${b.lines} lines ${crore(b.valueInr)} ${b.monthlyTonnes}t/mo`).join(" | "));
  console.log(" discounts", r.discountsApplied.map((d) => `${d.vendorId} ${d.percent}% met=${d.met} saving ₹${d.savingInr}`).join("; "));
  const rb = robustness(rule as any, ctx);
  console.log(` robustness: holds=${rb.holds}; could change winner: ${rb.critical.filter((c) => c.couldChangeWinner).map((c) => `${c.vendorId}/${c.lineId}`).join(", ") || "none"}; uncertain total ${rb.critical.length}`);
}
