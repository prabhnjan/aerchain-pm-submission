// Audit F15 probe: shift D's photo prices down one row for a block of lines (a classic misalignment),
// with the second read agreeing (common-mode error). Does anything catch it?
import { readFileSync, readdirSync } from "node:fs";
import { LINES } from "@/data/rfx";
import { buildCells, type VendorInput } from "@/lib/pipeline/normalise";
import { toEvidence } from "@/lib/ingest";
(async () => {
  const run = JSON.parse(readFileSync("data/runs/latest.json", "utf8"));
  const ref = JSON.parse(readFileSync("data/reference.json", "utf8"));
  const ex = JSON.parse(JSON.stringify(run.vendors.D.extraction));
  const block = ["PK-SHP-010", "PK-SHP-011", "PK-SHP-012", "PK-SHP-013"];
  const vals = block.map((id) => ex.lines.find((l: any) => l.rfx_line_id === id));
  const prices = vals.map((v: any) => [v.price_value, v.price_text, v.source_quote]);
  vals.forEach((v: any, i: number) => { const [p, t] = prices[(i + 1) % prices.length]; v.price_value = p; v.price_text = t; });
  const files = readdirSync("data/vendor-replies");
  const inputs: VendorInput[] = await Promise.all(Object.keys(run.vendors).map(async (id) => ({
    vendorId: id, extraction: id === "D" ? ex : run.vendors[id].extraction, secondRead: id === "D" ? ex : run.vendors[id].secondRead, // auditor "agrees"
    docs: await Promise.all(files.filter((f) => f.startsWith(`${id}_`)).map((f) => toEvidence(f, readFileSync(`data/vendor-replies/${f}`)))),
  })));
  const { cells } = buildCells(inputs, LINES, ref);
  for (const id of block) { const c = cells.find((x) => x.vendorId === "D" && x.lineId === id)!; console.log(`F15 D ${id}: ₹${c.inrPerPiece} ${c.status} ${JSON.stringify(c.reasons)}`); }
})();
