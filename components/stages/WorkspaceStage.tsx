"use client";
// One canvas after the replies are in: what Aera found → the table it built → the decision.
// Nothing navigates away. Findings highlight cells in the table; details open over it.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWS } from "../WorkspaceContext";
import { isFlagged } from "@/lib/insights";
import { runScenario, robustness } from "@/lib/scenario";
import { receivedCtx } from "@/lib/scenario/received";
import { PRESETS } from "@/lib/scenario/presets";
import { inr, inrBig } from "@/lib/format";
import { dimsLabel } from "@/lib/domain/spec";
import { fileKind } from "./replies-meta";
import { UploadReply } from "../canvas/UploadReply";
import type { Cell } from "@/lib/pipeline/types";

const key = (v: string, l: string) => `${v}|${l}`;

/** The comparison window: the table Aera built, then the award options computed from it. */
export function CompareWindow() {
  const { openPanel } = useWS();
  return <div className="ws-stage">
    <ComparisonTable />
    <section className="decide scroll-anchor" aria-labelledby="decide-title"><DecideSection /></section>
    <footer className="ws-footnote"><button onClick={() => openPanel({ kind: "evidence" })}>How Aera reads and checks replies, with test results →</button></footer>
  </div>;
}

export function ComparisonTable({ visibleVendorIds, allowUpload = false }: { visibleVendorIds?: string[]; allowUpload?: boolean } = {}) {
  const { lines, cells: allCells, vendorIds: allVendorIds, vendorName, openSource, run, focus, setFocus, openPanel, source } = useWS();
  const vendorIds = visibleVendorIds ?? allVendorIds;
  const cells = useMemo(() => allCells.filter((cell) => vendorIds.includes(cell.vendorId)), [allCells, vendorIds]);
  const [basis, setBasis] = useState<"landed" | "quoted">("landed");
  const [filter, setFilter] = useState<"all" | "check" | "missing">("all");
  const [legendOpen, setLegendOpen] = useState(false);
  const grid = useMemo(() => new Map(cells.map((c) => [key(c.vendorId, c.lineId), c])), [cells]);
  const val = (c?: Cell) => !c || c.inrPerPiece == null ? null : basis === "quoted" ? c.inrPerPiece : c.landedPerPiece ?? (c.landedRange ? (c.landedRange[0] + c.landedRange[1]) / 2 : c.inrPerPiece);
  const focusCells = new Set(focus?.cells ?? []);
  const focusVendors = new Set(focus?.vendors ?? []);
  const hasFocus = focusCells.size > 0 || focusVendors.size > 0;
  const lit = (v: string, l: string) => focusCells.has(key(v, l)) || (focusVendors.has(v) && focusCells.size === 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Bring the first highlighted cell (or column) into view, so "Show me" always lands on what it's about.
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => {
      if (focus.label === "Not quoted" && filter !== "missing") { setFilter("missing"); return; }
      if (focus.label === "Rows needing a second look" && filter !== "check") { setFilter("check"); return; }
      if (filter !== "all" && focus.label !== "Not quoted" && focus.label !== "Rows needing a second look") { setFilter("all"); return; }
      scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollRef.current?.querySelector(".cell-lit, .col-lit")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, filter]);
  const eligible = new Set(vendorIds.filter((id) => run.questionnaire.find((item) => item.vendorId === id)?.clears === "yes"));
  const nCheck = new Set(cells.filter((cell) => eligible.has(cell.vendorId) && isFlagged(cell)).map((cell) => cell.lineId)).size;
  const nMissing = cells.filter((c) => c.status === "missing").length;
  const shown = lines.filter((l) => filter === "all" || vendorIds.some((v) => {
    const c = grid.get(key(v, l.id));
    return filter === "check" ? !!c && eligible.has(v) && isFlagged(c) : c?.status === "missing";
  }));

  return <section className="compare" aria-labelledby="compare-title">
    <h2 id="compare-title" className="sr-only">Comparison</h2>
    <div className="compare-toolbar">
      <div className="compare-filters" role="group" aria-label="Filter items">
        <button aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setFocus(null); }}>All {lines.length} items</button>
        <button aria-pressed={filter === "check"} onClick={() => { setFilter("check"); setFocus(null); }}><i className="dot dot-amber" />Rows to check · {nCheck}</button>
        <button aria-pressed={filter === "missing"} onClick={() => { setFilter("missing"); setFocus(null); }}><i className="dot dot-grey" />Not quoted · {nMissing}</button>
      </div>
      {hasFocus && <div className="focus-pill" role="status"><span title={focus?.label}>Showing: {focus?.label}</span><button aria-label="Clear table highlight" title="Clear highlight" onClick={() => { setFocus(null); setFilter("all"); }}>×</button></div>}
      <button className="compare-guide-trigger" onClick={() => setLegendOpen(true)} aria-label="How to read this comparison" title="How to read this"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v5"/><circle cx="12" cy="7.5" r=".5" fill="currentColor" stroke="none"/></svg></button>
      <div className="price-basis-control"><div className="seg" role="group" aria-label="Price basis">{(["landed", "quoted"] as const).map((b) => <button key={b} aria-pressed={basis === b} onClick={() => setBasis(b)}>{b === "landed" ? "Landed cost" : "Quoted price"}</button>)}</div></div>
      {allowUpload && <UploadReply />}
    </div>
    {legendOpen && createPortal(<div className="compare-guide-backdrop" onClick={() => setLegendOpen(false)}><section className="compare-guide-modal" role="dialog" aria-modal="true" aria-label="How to read the comparison" onClick={(event) => event.stopPropagation()}><div className="compare-guide-head"><h3>How to read the comparison</h3><button autoFocus onClick={() => setLegendOpen(false)} aria-label="Close comparison guide">✕</button></div><dl><div><dt>Landed cost</dt><dd>Quoted price plus estimated freight and tooling per piece. Confirm the delivery destination before using it for an award.</dd></div><div><dt>Quoted price</dt><dd>The supplier&apos;s stated price converted to ₹ per piece, excluding GST.</dd></div></dl><div className="compare-guide-key"><span><i className="dot dot-amber" /> Needs a source check</span><span><i className="dot dot-violet" /> Filled from last year</span><span><i className="dot dot-green" /> Confirmed or corrected by you</span></div><p>* If freight is extra and unspecified, the landed view uses the midpoint of the lane estimate.</p></section></div>, document.body)}
    <div ref={scrollRef} className={`compare-scroll ${hasFocus ? "has-focus" : ""}`}>
      <table className="compare-table">
        <thead><tr>
          <th className="col-item">Item</th>
          <th className="col-qty">Qty / yr</th>
          {vendorIds.map((v) => {
            const quality = run.questionnaire.find((x) => x.vendorId === v);
            const q = quality?.clears;
            const qualityDetail = q === "yes" ? "All required quality checks cleared" : q === "no" ? quality?.failedMustHaves.join("; ") || "Required quality checks failed" : "No questionnaire answers received";
            return <th key={v} className={focusVendors.has(v) ? "col-lit" : ""}>
              <button className="vendor-head" onClick={() => openPanel({ kind: "supplier", vendorId: v })} title="Open this supplier's reply">
                <strong className="vendor-name" title={vendorName(v)}>{vendorName(v)}</strong>
                <span className={`q-pill q-${q}`} title={qualityDetail}>{q === "yes" ? "Cleared" : q === "no" ? "Did not clear" : "No answers"}</span>
                <small>{fileKind(run.vendors[v]?.files ?? []).filter((k) => !k.includes("certificate")).join(" + ")} reply</small>
              </button>
            </th>;
          })}
        </tr></thead>
        <tbody>
          {shown.map((l) => {
            const vals = vendorIds.map((v) => val(grid.get(key(v, l.id)))).filter((x): x is number => x != null);
            const min = vals.length ? Math.min(...vals) : null;
            return <tr key={l.id}>
              <td className="col-item"><strong>{l.description}</strong><small>{l.id} · {dimsLabel(l)} mm · {l.ply}-ply</small></td>
              <td className="col-qty num">{l.annualQty.toLocaleString("en-IN")}</td>
              {vendorIds.map((v) => {
                const c = grid.get(key(v, l.id));
                const x = val(c);
                const open = source?.vendorId === v && source?.lineId === l.id;
                return <td key={v} className={`${lit(v, l.id) ? "cell-lit" : ""} ${open ? "cell-open" : ""}`}>
                  <button onClick={() => openSource(v, l.id)} className={`cell cell-${c?.status ?? "missing"} ${x != null && x === min ? "cell-min" : ""}`} title={c?.reasons[0] ?? ""}>
                    {c?.status === "missing" ? <span className="cell-none">{c.reasons[0]?.startsWith("Vendor said") ? "“same as last year”" : "not quoted"}</span> : <>
                      <span className="num">{inr(x)}{basis === "landed" && c?.landedRange ? "*" : ""}</span>
                      {c && isFlagged(c) && <span className="cell-why">{c.status === "carried" ? "from last year" : shortReason(c.reasons[0])}</span>}
                      {c?.status === "confirmed" && <span className="cell-why cell-ok">confirmed</span>}
                      {c?.status === "overridden" && <span className="cell-why cell-ok">corrected</span>}
                    </>}
                  </button>
                </td>;
              })}
            </tr>;
          })}
        </tbody>
        <tfoot><tr>
          <td className="col-item" colSpan={2}>Annual value of the items each supplier quoted</td>
          {vendorIds.map((v) => {
            const cs = cells.filter((c) => c.vendorId === v && c.inrPerPiece != null);
            const total = cs.reduce((s, c) => s + (val(c) ?? 0) * (lines.find((l) => l.id === c.lineId)?.annualQty ?? 0), 0);
            return <td key={v} className="num"><strong>{inrBig(total)}</strong><small>{cs.length} of {lines.length} <b>items</b></small></td>;
          })}
        </tr></tfoot>
      </table>
    </div>
  </section>;
}

/** The first failed check, cut to a few words for the cell. The full reason is in the source panel. */
function shortReason(r?: string) {
  if (!r) return "check";
  const s = r.toLowerCase();
  if (s.startsWith("quoted per kg")) return "per kg → per piece";
  if (s.startsWith("rate given for a group")) return "rate may not cover this";
  if (s.startsWith("unit not written")) return "unit inferred";
  if (s.startsWith("spec deviation")) return "lighter board";
  if (s.includes("last-year price") || s.includes("vs last year")) return "far from last year";
  if (s.includes("other vendors' median")) return "far above others";
  if (s.startsWith("hard to read")) return "hard to read";
  if (s.startsWith("two independent reads")) return "two reads differ";
  if (s.includes("per 100")) return "per 100?";
  return "check";
}

export function DecideSection() {
  const { ctx: allCtx, vendorName, openPanel, lines, awardPreset, receivedVendorIds, vendorIds } = useWS();
  const ctx = useMemo(() => receivedCtx(allCtx, receivedVendorIds), [allCtx, receivedVendorIds]);
  const complete = receivedVendorIds.length === vendorIds.length;
  const options = useMemo(() => PRESETS.map((p) => ({ p, r: runScenario(p.rule, ctx), rb: robustness(p.rule, ctx) })), [ctx]);
  const best = Math.min(...options.filter((o) => o.p.id !== "all" && o.r.uncoveredLines.length === 0).map((o) => o.r.totalAfterDiscountsInr));
  return <>
    <div className="decide-head"><h2 id="decide-title">Who should supply the items?</h2><p>{complete ? "Compare three ways to place the order. Every option uses suppliers who passed the quality questionnaire." : `Provisional comparison · ${receivedVendorIds.length} of ${vendorIds.length} replies received. The allocation may change as replies arrive.`}</p></div>
    <div className="options">
      {options.filter(({ p }) => p.id !== "all").map(({ p, r, rb }) => {
        const explanation = p.id === "vp" ? "Give each item to its lowest-priced eligible supplier." : p.id === "one" ? "Try to place every item with one eligible supplier." : "Choose the cheapest allocation using no more than two eligible suppliers.";
        return <button key={p.id} className={`option ${r.totalAfterDiscountsInr === best ? "option-best" : ""} ${awardPreset === p.id ? "option-selected" : ""}`} aria-pressed={awardPreset === p.id} onClick={() => openPanel({ kind: "award", presetId: p.id })}>
          <span className="option-name">{p.label}{r.totalAfterDiscountsInr === best && <em>Lowest cost</em>}</span>
          <span className="option-explainer">{explanation}</span>
          <span className="option-total num">{inrBig(r.totalAfterDiscountsInr)}<small>per year</small></span>
          <span className="option-allocation-label">{r.byVendor.length} supplier{r.byVendor.length === 1 ? "" : "s"} would receive a draft</span>
          <span className="option-allocation">{r.byVendor.map((b) => <span key={b.vendorId}><strong>{vendorName(b.vendorId)}</strong><span>{b.lines} of {lines.length} items</span></span>)}{r.uncoveredLines.length > 0 && <span><strong>Unassigned</strong><span>{r.uncoveredLines.length} items</span></span>}</span>
          <span className={`option-holds ${rb.holds ? "holds-yes" : "holds-no"}`}>{rb.holds ? "Price checks passed" : "Price checks needed before award"}</span>
          <span className="option-open">Review this allocation →</span>
        </button>;
      })}
    </div>
    <details className="award-reference"><summary>See price-only reference</summary><p>Includes suppliers who did not pass the quality questionnaire. This is a comparison, not an award option.</p><button onClick={() => openPanel({ kind: "award", presetId: "all" })}>View reference →</button></details>
  </>;
}
