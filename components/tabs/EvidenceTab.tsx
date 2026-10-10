"use client";
// How the screen earns trust: the method, the measured results on ground truth, and every AI call.
import { useWS } from "../WorkspaceContext";

interface CellsEval { summary: Record<string, number | string> }
interface HeldoutEval { summary: Record<string, number | boolean> }
interface TrapsEval { handled: number; total: number; rows: { id: string; vendor: string; trap: string; handled: boolean; expected: string }[] }

const s0 = (c: unknown) => (c as CellsEval).summary.cells;

export function EvidenceTab() {
  const { evals, run, vendorName } = useWS();
  const ce = evals.cells as CellsEval;
  const te = evals.traps as TrapsEval;
  const ho = (evals.heldout as HeldoutEval).summary;
  const hb = (evals.heldoutBefore as HeldoutEval).summary;
  const g1 = (evals.heldoutGFirst as HeldoutEval).summary;
  const g2 = (evals.heldoutG as HeldoutEval).summary;
  const h1 = (evals.heldoutHFirst as HeldoutEval).summary;
  const n = Number(s0(evals.cells));
  const upper = (1 - Math.pow(0.05, 1 / n)) * 100;
  const s = ce.summary;
  const byPurpose = new Map<string, { n: number; cost: number; ms: number; model: string }>();
  for (const c of run.aiCalls) {
    const k = c.purpose.split(":")[0];
    const e = byPurpose.get(k) ?? { n: 0, cost: 0, ms: 0, model: c.model };
    e.n++; e.cost += c.costUsd; e.ms = Math.max(e.ms, c.ms);
    byPurpose.set(k, e);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 text-sm">
      <section className="rounded-lg border border-[var(--bitter-200)] bg-white p-4">
        <h2 className="text-base font-semibold">The rule: every number is a claim with evidence</h2>
        <p className="mt-1 text-[var(--bitter-700)]">An AI model reads each reply and must quote where every price came from. Code then checks each claim independently. The app never trusts a number because the AI said it; it trusts it because checks passed. When a check fails, the value is flagged with a plain reason instead of guessed.</p>
        <ul className="mt-2 grid list-disc gap-x-6 pl-5 text-[var(--bitter-700)] md:grid-cols-2">
          <li><b>Reader:</b> GPT-6.1 Sol reads every file (Excel, PDF, Word, photo, email).</li>
          <li><b>Auditor:</b> Claude Opus 5.5 re-reads photos on enlarged crops; disagreements are flagged.</li>
          <li><b>Quote check:</b> the quoted text must exist in the file; Excel cells must hold the claimed value.</li>
          <li><b>Plausibility:</b> price ÷ box weight (from your spec) must be ₹30–90/kg; outliers vs other vendors.</li>
          <li><b>Units and currency:</b> converted in code with the rule shown; missing is never zero.</li>
          <li><b>Analyst:</b> Claude Opus 5.5 answers only from tool calls; a number guard checks the answer.</li>
          <li><b>Robustness:</b> uncertain values pushed to their edges; does the award change?</li>
          <li><b>Questionnaire:</b> answers and certificates judged against your pass rules; &ldquo;unclear&rdquo; never passes.</li>
        </ul>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Big n={String(s.SILENT_ERRORS)} label="silent errors (wrong and not flagged)" tone="green" />
        <Big n={`${s.wrong_but_caught}/${s.wrong_values}`} label="wrong values caught" />
        <Big n={String(s.false_alarms)} label="false alarms" />
        <Big n={`${te.handled}/${te.total}`} label="planted traps handled" tone="green" />
      </section>
      <p className="text-xs text-[var(--bitter-500)]">Measured on {String(s.cells)} cells (5 vendors × 30 lines) against ground truth: the demo data was generated from a known truth table, then rendered into the messy files, so every output can be scored. {String(s.quiet_and_right)} values were right and needed no attention; {String(s.flagged_justified)} were flagged for a real reason (missing, converted per kg, smudged, ambiguous). <b>What this does and doesn&apos;t show:</b> 0 silent errors in {n} cells is an observed result on these files, not a guarantee. Even with 0 observed, the 95% upper bound on the per-cell silent-error rate is about {upper.toFixed(1)}%, and real errors cluster by document. The data is fabricated. Treat this as evidence the method works on these replies, not as a general accuracy rate.</p>

      <section className="rounded-lg border border-[var(--bitter-200)] bg-white p-4">
        <h2 className="font-semibold">Held-out reply: written by hand after the pipeline was frozen</h2>
        <p className="mt-1 text-[var(--bitter-700)]">A sixth reply in a format the generator never produced (sizes in cm, a per-1,000 price, a rate corrected inside the same email, freight per kg). Prompts, schema and thresholds were hashed before it was written.</p>
        <table className="mt-2 text-xs">
          <thead className="text-left text-[var(--bitter-500)]"><tr><th className="pr-6">Run</th><th className="pr-6">Right and quiet</th><th className="pr-6">Right but flagged</th><th className="pr-6">Silent errors</th><th>Freight / validity read</th></tr></thead>
          <tbody>
            <tr><td className="pr-6">First run (frozen)</td><td>{String(hb.quiet_and_right)}/{String(hb.quoted_in_truth)}</td><td className="text-[var(--international-orange-700)]">{String(hb.flags_on_right_values)}</td><td>{String(hb.SILENT_ERRORS)}</td><td>{hb.freight_read && hb.validity_read ? "yes" : "no"}</td></tr>
            <tr><td className="pr-6">After one fix</td><td>{String(ho.quiet_and_right)}/{String(ho.quoted_in_truth)}</td><td>{String(ho.flags_on_right_values)}</td><td>{String(ho.SILENT_ERRORS)}</td><td>{ho.freight_read && ho.validity_read ? "yes" : "no"}</td></tr>
          </tbody>
        </table>
        <h3 className="mt-4 font-semibold">Second held-out reply (G): frozen again, run once</h3>
        <p className="mt-1 text-[var(--bitter-700)]">Sizes in inches, prices <b>inclusive of GST</b>, a per-1,000 price, an MOQ, buyer codes on only some lines.</p>
        <table className="mt-2 text-xs">
          <thead className="text-left text-[var(--bitter-500)]"><tr><th className="pr-6">Run</th><th className="pr-6">Right and quiet</th><th className="pr-6">Wrong but flagged</th><th className="pr-6">Silent errors</th></tr></thead>
          <tbody>
            <tr><td className="pr-6">First run (frozen)</td><td>{String(g1.quiet_and_right)}/{String(g1.quoted_in_truth)}</td><td>{String(g1.wrong_but_caught)}</td><td className="font-semibold text-[var(--punch-700)]">{String(g1.SILENT_ERRORS)}</td></tr>
            <tr><td className="pr-6">After the fix (re-read)</td><td>{String(g2.quiet_and_right)}/{String(g2.quoted_in_truth)}</td><td>{String(g2.wrong_but_caught)}</td><td>{String(g2.SILENT_ERRORS)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[var(--bitter-600)]">The first run treated GST-inclusive prices as ex-GST: every price was 5% high, inside the plausibility band, so 6 were wrong and quiet. The reader now labels GST basis, code removes GST from inclusive prices, and a vendor that doesn&apos;t state GST is flagged. This is the most important failure we found. A clean held-out test showed it; our own generated data never would have.</p>
        <h3 className="mt-4 font-semibold">Third held-out reply (H): the clean measurement of the fixed pipeline</h3>
        <p className="mt-1 text-[var(--bitter-700)]">Frozen again after the G fixes, then a CSV written by hand, run once: a vendor&apos;s typo&apos;d item code (PK-SHP-012 written on the PK-SHP-014 row), per-100 partitions, an &ldquo;on request&rdquo; line, freight per kg.</p>
        <p className="mt-1 text-xs"><b>First run:</b> {String(h1.quiet_and_right)}/{String(h1.quoted_in_truth)} right and quiet · <b>{String(h1.SILENT_ERRORS)} silent errors</b> · typo&apos;d code caught · {String(h1.flags_on_right_values)} false alarms (spreadsheet rows with no code borrowed neighbouring codes; fixed after, logged).</p>
        <p className="mt-2 text-xs text-[var(--bitter-600)]">The first run read all 12 prices correctly (including the in-email correction), but our own line-match check assumed sizes in mm and flagged every one. The fix accepts mm, cm or inches. Extraction was not re-run or tuned.</p>
      </section>

      <section className="rounded-lg border border-[var(--bitter-200)] bg-white p-4">
        <h2 className="font-semibold">Failures we found, and what changed</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--bitter-700)]">
          <li><b>Correct number, wrong line.</b> A deliberate probe swapped two similar prices between lines; both stayed quiet. Added a line-match check (codes or sizes next to the price). Now both are flagged.</li>
          <li><b>&ldquo;38 for the 3-ply&rdquo; read as ₹38 per box.</b> The unit carried over from &ldquo;₹42/kg&rdquo; in the same sentence. The reader now marks inferred units, and they&apos;re flagged.</li>
          <li><b>Freight misread for 2 vendors</b> by a keyword rule (&ldquo;buyer&apos;s plant&rdquo;, &ldquo;GST extra&rdquo;). Freight is now classified by the reader and applied by code. This was a silent error at the terms level that eval 1 couldn&apos;t see.</li>
          <li><b>&ldquo;At most 2 vendors&rdquo; picked a dearer split</b> because it compared vendor sets before conditional discounts. It now compares whole allocations after discounts.</li>
          <li><b>A photo row shift that both models agreed on.</b> A probe moved 4 prices down a row on the rate card; 3 were caught by plausibility, 1 (₹32.86 vs ₹33.26) stayed quiet. Added a check that the price must appear inside the vendor text quoted for it. Now all 4 are flagged.</li>
          <li><b>A garbage file &ldquo;succeeded&rdquo;</b> as an empty vendor. A read that finds no prices is now a visible failure and changes nothing.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Planted traps</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--bitter-200)] bg-white">
          <table className="w-full text-xs">
            <tbody>{te.rows.map((r) => <tr key={r.id} className="border-t border-[var(--bitter-100)]"><td className="px-2 py-1">{r.handled ? "✓" : "✗"}</td><td className="px-2 py-1">{vendorName(r.vendor)}</td><td className="px-2 py-1">{r.trap}</td><td className="px-2 py-1 text-[var(--bitter-500)]">{r.expected}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">AI calls in the current run</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--bitter-200)] bg-white">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bitter-100)] text-left"><tr><th className="px-2 py-1">Step</th><th className="px-2 py-1">Model</th><th className="px-2 py-1 text-right">Calls</th><th className="px-2 py-1 text-right">Slowest</th><th className="px-2 py-1 text-right">Cost</th></tr></thead>
            <tbody>{[...byPurpose.entries()].map(([k, e]) => <tr key={k} className="border-t border-[var(--bitter-100)]"><td className="px-2 py-1">{k}</td><td className="px-2 py-1">{e.model}</td><td className="px-2 py-1 text-right">{e.n}</td><td className="px-2 py-1 text-right">{(e.ms / 1000).toFixed(0)}s</td><td className="px-2 py-1 text-right">${e.cost.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Big({ n, label, tone }: { n: string; label: string; tone?: "green" }) {
  return <div className="rounded-lg border border-[var(--bitter-200)] bg-white p-4"><div className={`num text-3xl font-semibold ${tone === "green" ? "text-[var(--malachite-700)]" : ""}`}>{n}</div><div className="text-xs text-[var(--bitter-500)]">{label}</div></div>;
}
