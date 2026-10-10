// Prints what the model will see for each vendor file (no AI calls).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toEvidence } from "@/lib/ingest";
const dir = join(process.cwd(), "data", "vendor-replies");
(async () => {
  for (const f of readdirSync(dir)) {
    const e = await toEvidence(f, readFileSync(join(dir, f)));
    console.log(`\n### ${f} kind=${e.kind} secondRead=${e.needsSecondRead} textChars=${e.text.length} cells=${Object.keys(e.cellMap ?? {}).length}`);
    console.log(e.text.split("\n").slice(0, 6).join("\n"));
  }
})();
