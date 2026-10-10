// Eval 1: silent errors. Every cell is right or wrong (vs ground truth) and flagged or quiet.
// The number that matters: wrong AND quiet = silent error. Target 0.
//   npx tsx evals/cells.eval.ts   (reads data/runs/latest.json and data/truth/truth.json)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Truth } from "@/data/truth/types";
import type { Cell } from "@/lib/pipeline/types";

const ROOT = process.cwd();
const truth: Truth = JSON.parse(readFileSync(join(ROOT, "data", "truth", "truth.json"), "utf8"));
const run = JSON.parse(readFileSync(join(ROOT, "data", "runs", "latest.json"), "utf8"));
const cells: Cell[] = run.cells;

const TOL = (v: number) => Math.max(0.02, v * 0.005); // ₹0.02 or 0.5%
type Bucket = "quiet_right" | "caught" | "justified_flag" | "false_alarm" | "SILENT_ERROR";
const rows: { vendor: string; line: string; bucket: Bucket; truth: number | null; got: number | null; status: string; why: string }[] = [];

for (const t of truth.cells) {
  const c = cells.find((x) => x.vendorId === t.vendorId && x.lineId === t.lineId);
  const got = c?.inrPerPiece ?? null;
  const exp = t.inrPerPiece;
  const right = exp == null ? got == null : got != null && Math.abs(got - exp) <= TOL(exp);
  // Visible to the buyer = not silently trusted: needs review, carried (marked "confirm"), or shown as missing.
  const flagged = !!c && (c.status === "needs_review" || c.status === "carried" || c.status === "missing");
  const trapExpectsFlag = t.trapIds.some((id) => ["flag", "carried_and_flag"].includes(truth.traps.find((x) => x.id === id)?.expected ?? "")) || !!t.specDeviation;
  let bucket: Bucket;
  if (right && !flagged) bucket = "quiet_right";
  else if (right && flagged) bucket = exp == null || trapExpectsFlag ? "justified_flag" : "false_alarm";
  else if (!right && flagged) bucket = "caught";
  else bucket = "SILENT_ERROR";
  rows.push({ vendor: t.vendorId, line: t.lineId, bucket, truth: exp, got, status: c?.status ?? "absent", why: c?.reasons.join("; ") ?? "" });
}

const count = (b: Bucket) => rows.filter((r) => r.bucket === b).length;
const wrong = count("caught") + count("SILENT_ERROR");
const summary = {
  ranAt: run.ranAt,
  cells: rows.length,
  quiet_and_right: count("quiet_right"),
  flagged_justified: count("justified_flag"),
  false_alarms: count("false_alarm"),
  wrong_values: wrong,
  wrong_but_caught: count("caught"),
  SILENT_ERRORS: count("SILENT_ERROR"),
  flagged_total: rows.filter((r) => r.bucket !== "quiet_right" && r.bucket !== "SILENT_ERROR").length,
};
console.table(summary);
for (const v of ["A", "B", "C", "D", "E"]) {
  const r = rows.filter((x) => x.vendor === v);
  console.log(`${v}: right ${r.filter((x) => x.bucket !== "caught" && x.bucket !== "SILENT_ERROR").length}/30, flagged ${r.filter((x) => x.status !== "verified" && x.status !== "converted").length}, silent ${r.filter((x) => x.bucket === "SILENT_ERROR").length}`);
}
const bad = rows.filter((r) => r.bucket === "SILENT_ERROR" || r.bucket === "caught" || r.bucket === "false_alarm");
if (bad.length) {
  console.log("\nDetail (silent errors, caught errors, false alarms):");
  for (const r of bad) console.log(`  [${r.bucket}] ${r.vendor} ${r.line}: truth ${r.truth} got ${r.got} (${r.status}) ${r.why}`);
}
writeFileSync(join(ROOT, "evals", "results-cells.json"), JSON.stringify({ summary, rows }, null, 2));
