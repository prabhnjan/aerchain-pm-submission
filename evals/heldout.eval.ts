// Held-out eval (audit F09): the frozen pipeline vs a hand-written reply it was never tuned on.
import { readFileSync, writeFileSync } from "node:fs";
const id = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1] ?? "F";
const truth = JSON.parse(readFileSync(`evals/heldout/${id}-truth.json`, "utf8"));
const run = JSON.parse(readFileSync(`evals/heldout/run-${id}.json`, "utf8"));
const rows = run.cells.map((c: { lineId: string; inrPerPiece: number | null; status: string; reasons: string[] }) => {
  const exp = truth.quoted[c.lineId] ?? null;
  const right = exp == null ? c.inrPerPiece == null : c.inrPerPiece != null && Math.abs(c.inrPerPiece - exp) <= Math.max(0.02, exp * 0.005);
  const flagged = ["needs_review", "carried", "missing"].includes(c.status);
  const bucket = right && !flagged ? "quiet_right" : right && flagged ? (exp == null ? "justified_flag" : "flag_on_right") : !right && flagged ? "caught" : "SILENT_ERROR";
  return { line: c.lineId, truth: exp, got: c.inrPerPiece, status: c.status, bucket, why: c.reasons.join("; ") };
});
const n = (b: string) => rows.filter((r: { bucket: string }) => r.bucket === b).length;
const t = run.terms;
const summary = {
  cells: rows.length, quoted_in_truth: Object.keys(truth.quoted).length,
  quiet_and_right: n("quiet_right"), flags_on_right_values: n("flag_on_right"), missing_shown_correctly: n("justified_flag"),
  wrong_but_caught: n("caught"), SILENT_ERRORS: n("SILENT_ERROR"),
  freight_read: truth.freight === "delivered" ? t?.freight?.kind === "delivered" : t?.freight?.kind === "extra_stated" && t?.freight?.inrPerKg === truth.freightInrPerKg,
  validity_read: t?.validityDays === truth.validityDays,
};
console.table(summary);
for (const r of rows.filter((r: { bucket: string }) => r.bucket !== "quiet_right" && r.bucket !== "justified_flag")) console.log(`  [${r.bucket}] ${r.line}: truth ${r.truth} got ${r.got} (${r.status}) ${r.why}`);
writeFileSync(id === "F" ? "evals/results-heldout.json" : `evals/results-heldout-${id}.json`, JSON.stringify({ summary, rows }, null, 2));
