"use client";
// One grid: same lines, same unit (₹ per piece), same currency (INR, ex-GST), every cell clickable to its source.
import { useMemo, useState } from "react";
import { useWS } from "../WorkspaceContext";
import { inr, inrBig, STATUS_ICON, STATUS_STYLE } from "@/lib/format";
import { runScenario, robustness } from "@/lib/scenario";
import { PRESETS } from "@/lib/scenario/presets";
import { dimsLabel } from "@/lib/domain/spec";
import type { Cell } from "@/lib/pipeline/types";

export function CompareTab() {
  const { lines, cells, vendorIds, vendorName, openSource, run } = useWS();
  const [basis, setBasis] = useState<"quoted" | "landed">("landed");
  const [filter, setFilter] = useState<"all" | "flagged">("all");

  const val = (c?: Cell) => {
    if (!c || c.inrPerPiece == null) return null;
    if (basis === "quoted") return c.inrPerPiece;
    return c.landedPerPiece ?? (c.landedRange ? (c.landedRange[0] + c.landedRange[1]) / 2 : c.inrPerPiece);
  };
  const grid = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of cells) m.set(`${c.vendorId}|${c.lineId}`, c);
    return m;
  }, [cells]);
  const shownLines = lines.filter((l) => filter === "all" || vendorIds.some((v) => ["needs_review", "carried"].includes(grid.get(`${v}|${l.id}`)?.status ?? "")));

  return (
    <div>
      <DecisionStrip />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--bitter-600)]">
          All prices <b>₹ per piece, ex-GST</b>. {basis === "landed" ? "Landed = price + freight + tooling spread over annual quantity." : "Quoted = the vendor's price, converted to ₹ per piece."} Lowest per line is bold. Click any value to see its source.
        </p>
        <div className="flex gap-2 text-sm">
          <Toggle value={basis} set={setBasis} options={[["landed", "Landed cost"], ["quoted", "Quoted price"]]} />
          <Toggle value={filter} set={setFilter} options={[["all", "All lines"], ["flagged", "Only lines with flags"]]} />
        </div>
      </div>
      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 bg-[var(--bitter-100)] text-left text-xs text-[var(--bitter-600)]">
            <tr>
              <th className="px-3 py-2 font-medium">Line</th>
              <th className="px-2 py-2 text-right font-medium">Qty/yr</th>
              {vendorIds.map((v) => {
                const q = run.questionnaire.find((x) => x.vendorId === v);
                const t = run.terms.find((x) => x.vendorId === v);
                return (
                  <th key={v} className="px-2 py-2 text-right font-medium">
                    <div className="text-[var(--bitter-900)]">{vendorName(v)}</div>
                    <div className="font-normal">{run.vendors[v]?.files?.[0]?.split(".").pop()?.toUpperCase()} · {t?.freight.kind === "delivered" ? "delivered" : t?.freight.kind === "extra_stated" ? `freight ₹${t.freight.inrPerKg}/kg` : t?.freight.kind === "extra_unknown" ? "freight extra (?)" : "freight ?"}</div>
                    <div className={q?.clears === "yes" ? "text-[var(--malachite-700)]" : q?.clears === "no" ? "text-[var(--punch-700)]" : "text-[var(--bitter-500)]"}>
                      {q?.clears === "yes" ? "✓ cleared quality" : q?.clears === "no" ? "✗ did not clear quality" : "– no questionnaire"}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shownLines.map((l) => {
              const vals = vendorIds.map((v) => val(grid.get(`${v}|${l.id}`))).filter((x): x is number => x != null);
              const min = vals.length ? Math.min(...vals) : null;
              return (
                <tr key={l.id} className="border-t border-[var(--bitter-100)] hover:bg-[var(--bitter-50)]/60">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{l.id}</div>
                    <div className="text-xs text-[var(--bitter-500)]">{l.description} · {dimsLabel(l)} · {l.ply}-ply</div>
                  </td>
                  <td className="num px-2 py-1.5 text-right text-[var(--bitter-600)]">{l.annualQty.toLocaleString("en-IN")}</td>
                  {vendorIds.map((v) => {
                    const c = grid.get(`${v}|${l.id}`);
                    const x = val(c);
                    return (
                      <td key={v} className="px-1 py-1 text-right">
                        <button
                          onClick={() => openSource(v, l.id)}
                          title={c?.reasons.join("\n") || ""}
                          className={`num w-full rounded px-2 py-1 text-right ${STATUS_STYLE[c?.status ?? "missing"]} ${x != null && x === min ? "font-bold" : ""} hover:outline hover:outline-stone-300`}
                        >
                          {c?.status === "missing" ? <span className="text-xs">{c.reasons[0]?.startsWith("Vendor said") ? "by reference: no record" : "not quoted"}</span> : <>{STATUS_ICON[c?.status ?? ""]} {inr(x)}{basis === "landed" && c?.landedRange ? "*" : ""}</>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-[var(--bitter-300)] bg-[var(--bitter-50)] text-sm">
            <tr>
              <td className="px-3 py-2 font-medium" colSpan={2}>Annual value of lines quoted</td>
              {vendorIds.map((v) => {
                const cs = cells.filter((c) => c.vendorId === v && c.inrPerPiece != null);
                const total = cs.reduce((s, c) => s + (val(c) ?? 0) * (lines.find((l) => l.id === c.lineId)?.annualQty ?? 0), 0);
                return (
                  <td key={v} className="num px-3 py-2 text-right">
                    <div className="font-semibold">{inrBig(total)}</div>
                    <div className="text-xs text-[var(--bitter-500)]">{cs.length} of {lines.length} lines</div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <Legend />
      {basis === "landed" && <p className="mt-1 text-xs text-[var(--bitter-500)]">* Freight is extra with no amount given: midpoint of your lane estimate (₹1.5–3.0/kg) shown; the range is in the source panel.</p>}
      <Questionnaire />
    </div>
  );
}

function Toggle<T extends string>({ value, set, options }: { value: T; set: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-[var(--bitter-300)] bg-white/80 p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => set(v)} className={`rounded-full px-2.5 py-1 ${value === v ? "bg-[var(--bitter-900)] text-white" : "text-[var(--bitter-700)] hover:bg-[var(--bitter-50)]"}`}>{label}</button>
      ))}
    </div>
  );
}

export function Legend() {
  const items: [string, string, string][] = [
    ["verified", "", "Checks passed (still a machine reading)"],
    ["converted", "⇄", "Converted (unit or currency)"],
    ["needs_review", "⚠", "Needs review: a check failed"],
    ["carried", "↺", "Filled from last year: confirm"],
    ["confirmed", "✓", "Confirmed by you"],
    ["overridden", "✎", "Corrected by you"],
    ["missing", "", "Not quoted (never counted as 0)"],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      {items.map(([s, i, label]) => <span key={s} className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[s]} ${s === "verified" || s === "converted" ? "bg-white ring-1 ring-inset ring-[var(--bitter-200)]" : ""}`}>{i} {label}</span>)}
    </div>
  );
}

function Questionnaire() {
  const { run, vendorIds, vendorName, questions } = useWS();
  const must = questions.filter((q) => q.mustHave);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">Quality questionnaire: must-haves, side by side</h2>
      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-[var(--bitter-100)] text-left text-[var(--bitter-600)]">
            <tr><th className="px-3 py-2 font-medium">Question · pass rule</th>{vendorIds.map((v) => <th key={v} className="px-2 py-2 font-medium">{vendorName(v)}</th>)}</tr>
          </thead>
          <tbody>
            {must.map((q) => (
              <tr key={q.id} className="border-t border-[var(--bitter-100)] align-top">
                <td className="px-3 py-1.5"><div className="font-medium text-[var(--bitter-800)]">{q.text}</div><div className="text-[var(--bitter-500)]">{q.passRule}</div></td>
                {vendorIds.map((v) => {
                  const verdict = run.questionnaire.find((x) => x.vendorId === v)?.verdicts.find((x) => x.question_id === q.id);
                  const color = verdict?.verdict === "pass" ? "text-[var(--malachite-700)]" : verdict?.verdict === "fail" ? "text-[var(--punch-700)]" : "text-[var(--international-orange-700)]";
                  return (
                    <td key={v} className="px-2 py-1.5" title={verdict?.evidence_quote}>
                      <span className={`font-medium ${color}`}>{verdict ? verdict.verdict.replace("_", " ") : "—"}</span>
                      <div className="text-[var(--bitter-500)]">{verdict?.reason}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Audit F20: the decision, visible on the main canvas. Computed by the same engine as the Award tab. */
function DecisionStrip() {
  const { ctx, vendorName, setTab } = useWS();
  const vp = PRESETS.find((p) => p.id === "vp")!;
  const one = PRESETS.find((p) => p.id === "one")!;
  const r = useMemo(() => runScenario(vp.rule, ctx), [ctx, vp]);
  const r1 = useMemo(() => runScenario(one.rule, ctx), [ctx, one]);
  const rb = useMemo(() => robustness(vp.rule, ctx), [ctx, vp]);
  const cheaper = r1.totalAfterDiscountsInr < r.totalAfterDiscountsInr && r1.uncoveredLines.length <= r.uncoveredLines.length;
  return (
    <div className="glass-card mb-4 grid gap-3 p-4 text-sm md:grid-cols-4">
      <div className="md:col-span-2">
        <div className="text-xs text-[var(--bitter-500)]">Qualified split · lowest landed cost per line</div>
        <div className="mt-0.5"><b className="num text-base">{inrBig(r.totalAfterDiscountsInr)}</b> · {r.byVendor.map((b) => `${vendorName(b.vendorId)} ${b.lines}`).join(", ")} · {r.uncoveredLines.length ? `${r.uncoveredLines.length} uncovered` : "all lines covered"}</div>
        {cheaper && <div className="mt-0.5 text-[var(--malachite-800)]">Cheaper: everything to {vendorName(r1.byVendor[0].vendorId)} at <b className="num">{inrBig(r1.totalAfterDiscountsInr)}</b> (conditional discount), 1 vendor instead of {r.byVendor.length}.</div>}
      </div>
      <div className={rb.holds ? "text-[var(--malachite-800)]" : "text-[var(--international-orange-800)]"}>
        <div className="text-xs text-[var(--bitter-500)]">Award confidence</div>
        {rb.holds ? `No winner changes across ${rb.critical.length} tested price ${rb.critical.length === 1 ? "range" : "ranges"}` : `${rb.critical.filter((c) => c.couldChangeWinner !== false).length} price ${rb.critical.filter((c) => c.couldChangeWinner !== false).length === 1 ? "value needs" : "values need"} confirmation`}
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <button onClick={() => setTab("review")} className="rounded-md border border-[var(--bitter-300)] px-2 py-1 text-xs hover:bg-[var(--bitter-50)]">What to check</button>
        <button onClick={() => setTab("award")} className="rounded-md bg-[var(--bitter-900)] px-2 py-1 text-xs text-white">Award &amp; memo</button>
      </div>
    </div>
  );
}
