// Exact figures for the one-page note, computed by the same engine the app uses.
import { qualification, capacityFrom } from "@/lib/questionnaire/eligibility";
import { QUESTIONNAIRE as QUESTIONNAIRE_FOR_QUAL } from "@/data/rfx";
import { readFileSync } from "node:fs";
import { LINES } from "@/data/rfx";
import { runScenario, robustness, type Ctx } from "@/lib/scenario";
const run = JSON.parse(readFileSync("data/runs/latest.json", "utf8"));
const ref = JSON.parse(readFileSync("data/reference.json", "utf8"));
const ctx: Ctx = { lines: LINES, cells: run.cells, terms: run.terms, history: ref.history, ...qualification(run.questionnaire, QUESTIONNAIRE_FOR_QUAL), capacity: capacityFrom(run.vendors) };
const vp = runScenario({ rule: "cheapest_per_line", vendorFilter: "cleared_questionnaire" }, ctx);
const one = runScenario({ rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 1 }, ctx);
const all = runScenario({ rule: "cheapest_per_line", vendorFilter: "all" }, ctx);
const rbAll = robustness({ rule: "cheapest_per_line", vendorFilter: "all" }, ctx);
console.log(JSON.stringify({
  vp: { pre: vp.totalInr, after: vp.totalAfterDiscountsInr, split: vp.byVendor, disc: vp.discountsApplied },
  oneVendor: { pre: one.totalInr, after: one.totalAfterDiscountsInr, split: one.byVendor },
  diff: vp.totalAfterDiscountsInr - one.totalAfterDiscountsInr,
  lastYear: vp.lastYearSameLinesInr,
  allVendors: { after: all.totalAfterDiscountsInr, unconfirmed: all.unconfirmedCellsUsed, unknown: rbAll.unknown, holds: rbAll.holds },
}, null, 1));
