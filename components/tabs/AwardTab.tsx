"use client";
// Pick an award rule, see the computed result, and export a memo an auditor can follow.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { useWS } from "../WorkspaceContext";
import { runScenario, robustness } from "@/lib/scenario";
import { receivedCtx } from "@/lib/scenario/received";
import { PRESETS } from "@/lib/scenario/presets";
import { inr, inrBig, STATUS_LABEL } from "@/lib/format";

export function AwardTab({ initialPreset = "vp", embedded = false }: { initialPreset?: string; embedded?: boolean }) {
  const { ctx: allCtx, vendorName, lines, cells: allCells, run: allRun, buyer, overrides, openSource, reference, termDecisions, setTab, receivedVendorIds, vendorIds, supplierDraftPreset, setSupplierDraftPreset } = useWS();
  const complete = receivedVendorIds.length === vendorIds.length;
  const ctx = useMemo(() => receivedCtx(allCtx, receivedVendorIds), [allCtx, receivedVendorIds]);
  const cells = useMemo(() => allCells.filter((cell) => receivedVendorIds.includes(cell.vendorId)), [allCells, receivedVendorIds]);
  const run = useMemo(() => ({ ...allRun, terms: allRun.terms.filter((term) => receivedVendorIds.includes(term.vendorId)) }), [allRun, receivedVendorIds]);
  const [presetId, setPresetId] = useState(initialPreset);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const r = useMemo(() => runScenario(preset.rule, ctx), [preset, ctx]);
  const rb = useMemo(() => robustness(preset.rule, ctx), [preset, ctx]);
  const others = useMemo(() => PRESETS.map((p) => ({ p, r: runScenario(p.rule, ctx) })), [ctx]);
  const line = useCallback((id: string) => lines.find((l) => l.id === id)!, [lines]);
  const awardTerms = useMemo(() => run.terms.filter((term) => term.flags.length && r.byVendor.some((vendor) => vendor.vendorId === term.vendorId)), [run.terms, r]);
  const openTerms = awardTerms.filter((term) => termDecisions[term.vendorId]?.status !== "accepted");
  const canExportAward = complete && presetId !== "all" && openTerms.length === 0 && rb.holds && r.uncoveredLines.length === 0 && !r.moqNotes.some((note) => note.startsWith("BLOCKER"));
  const selectedVendor = r.byVendor.find((vendor) => vendor.vendorId === selectedVendorId) ?? r.byVendor[0];
  const selectedLines = r.lines.filter((award) => award.vendorId === selectedVendor?.vendorId);
  const selectedTerms = run.terms.find((term) => term.vendorId === selectedVendor?.vendorId);
  const selectedDiscount = r.discountsApplied.filter((discount) => discount.vendorId === selectedVendor?.vendorId && discount.met);
  const selectedNetValue = selectedVendor ? selectedVendor.valueInr - selectedDiscount.reduce((sum, discount) => sum + discount.savingInr, 0) : 0;
  const selectedDecision = selectedVendor ? termDecisions[selectedVendor.vendorId] : undefined;
  const selectedChecks = [
    ...(selectedLines.some((award) => award.unconfirmed) ? [`${selectedLines.filter((award) => award.unconfirmed).length} awarded price${selectedLines.filter((award) => award.unconfirmed).length === 1 ? "" : "s"} need source confirmation`] : []),
    ...(selectedTerms?.flags.length && selectedDecision?.status !== "accepted" ? ["Commercial terms need a buyer decision"] : []),
    ...(!rb.holds ? ["The award could change after uncertain prices are checked"] : []),
    ...(!complete ? ["Supplier replies are still arriving"] : []),
    ...r.moqNotes.filter((note) => note.startsWith("BLOCKER") && note.includes(selectedVendor?.vendorId ?? "\u0000")),
  ];
  const draftsReady = supplierDraftPreset === presetId && presetId !== "all";
  const openSupplierDraft = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setHandoffOpen(true);
  };

  useEffect(() => {
    if (!handoffOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setHandoffOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [handoffOpen]);

  const memo = useMemo(() => {
    const L: string[] = [];
    L.push(`AWARD RECOMMENDATION: ${buyer.title} (${buyer.rfxId})`, `${buyer.company}, ${buyer.plant}. Prepared ${new Date().toLocaleDateString("en-IN")}.`, "");
    L.push(`Rule: ${preset.label}.`);
    L.push(`Annual value: ${inrBig(r.totalInr)} before conditional discounts; ${inrBig(r.totalAfterDiscountsInr)} after discounts whose conditions this award meets.`);
    if (r.lastYearSameLinesInr) L.push(`Last year, same lines: ${inrBig(r.lastYearSameLinesInr)} (lowest price paid per line).`);
    L.push("", "Split by vendor:");
    for (const b of r.byVendor) L.push(`- ${vendorName(b.vendorId)}: ${b.lines} lines, ${inrBig(b.valueInr)}, about ${b.monthlyTonnes} t/month`);
    L.push("", "Vendors not considered:");
    for (const x of r.vendorsExcluded) L.push(`- ${vendorName(x.vendorId)}: ${x.why}`);
    if (r.discountsApplied.length) {
      L.push("", "Conditional discounts:");
      for (const d of r.discountsApplied) L.push(`- ${vendorName(d.vendorId)} ${d.percent}% if ${d.condition}: ${d.met ? `met (${d.monthlyTonnes} t/month), saving ${inrBig(d.savingInr)}` : `not met (${d.monthlyTonnes} t/month)`}`);
    }
    L.push("", "Is the decision robust?");
    L.push(rb.holds ? `Yes. ${rb.critical.length} uncertain value(s) were tested at the edges of their plausible range; no line's winner changes.` : `Not yet. These values could change a winner, or can't be bounded, and must be confirmed first: ${rb.critical.filter((c) => c.couldChangeWinner !== false).map((c) => `${vendorName(c.vendorId)} ${c.lineId}`).join(", ")}.`);
    L.push(`Unconfirmed values used in this award: ${r.unconfirmedCellsUsed}. Uncovered lines: ${r.uncoveredLines.length ? r.uncoveredLines.join(", ") : "none"}.`);
    L.push("", "Capacity (each vendor's spare capacity must be at least 1.5x the volume awarded):");
    L.push(...(r.capacityNotes.length ? r.capacityNotes.map((n) => `- ${n}`) : ["- Every awarded vendor has room for its share."]));
    if (r.moqNotes.length) L.push("", "Minimum order quantities:", ...r.moqNotes.map((n) => `- ${n}`));
    L.push("", "Buyer review of awarded supplier terms:");
    if (!awardTerms.length) L.push("- No commercial flags on suppliers in this scenario.");
    for (const term of awardTerms) {
      const decision = termDecisions[term.vendorId];
      L.push(`- ${vendorName(term.vendorId)}: ${term.flags.join("; ")}. ${decision ? `${decision.status === "accepted" ? "Accepted" : "Clarification needed"} by buyer: ${decision.note} (${new Date(decision.at).toLocaleString("en-IN")}).` : "No buyer decision recorded."}`);
    }
    L.push("", "Assumptions:");
    for (const a of r.assumptions) L.push(`- ${a}`);
    L.push(`- USD converted at ${reference.fx.usdInr} (${reference.fx.date}; ${reference.fx.source}).`);
    L.push(`- Per-kg quotes converted using box weight computed from our own spec (dimensions, ply, GSM).`);
    L.push("", "Buyer actions on extracted values:");
    if (!overrides.length) L.push("- None.");
    for (const o of overrides) L.push(`- ${o.action === "confirm" ? "Confirmed" : `Corrected to ${inr(o.value)}`}: ${vendorName(o.vendorId)} ${o.lineId}. ${o.note} (${new Date(o.at).toLocaleString("en-IN")})`);
    L.push("", "Line-by-line award (price = landed, ₹/piece ex-GST; source in the attached workbook):");
    for (const a of r.lines) L.push(`- ${a.lineId} ${line(a.lineId).description}: ${a.vendorId ? `${vendorName(a.vendorId)} at ${inr(a.unitPrice)} × ${a.annualQty.toLocaleString("en-IN")} = ${inrBig(a.annualValue)}` : "NO QUALIFIED QUOTE"}${a.unconfirmed ? " (UNCONFIRMED)" : ""}`);
    L.push("", "Reviewed by: Category buyer ____________   Approved by: VP Procurement ____________");
    return L.join("\n");
  }, [r, rb, preset, buyer, overrides, reference, vendorName, line, awardTerms, termDecisions]);

  const exportXlsx = () => {
    const rows = r.lines.map((a) => {
      const c = cells.find((x) => x.vendorId === a.vendorId && x.lineId === a.lineId);
      return [a.lineId, line(a.lineId).description, a.vendorId ? vendorName(a.vendorId) : "—", a.unitPrice, a.annualQty, a.annualValue, c ? STATUS_LABEL[c.status] : "", c?.source.quote ?? "", c?.source.ref ?? "", c?.conversion.join("; ") ?? ""];
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Line", "Description", "Vendor", "Landed ₹/pc", "Annual qty", "Annual ₹", "Status", "Source quote", "Where", "Conversion"], ...rows]), "Award");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memo.split("\n").map((x) => [x])), "Memo");
    XLSX.writeFile(wb, `${buyer.rfxId}_award_${preset.id}.xlsx`);
  };
  const downloadMemo = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([memo], { type: "text/plain" }));
    a.download = `${buyer.rfxId}_award_memo.txt`;
    a.click();
  };

  return (
    <div className="space-y-5">
      {!complete && <p className="partial-review-note">Provisional · {receivedVendorIds.length} of {vendorIds.length} replies received. Award exports unlock after all replies arrive.</p>}
      {!embedded && <><div className="grid gap-2 md:grid-cols-3">
        {others.filter(({ p }) => p.id !== "all").map(({ p, r: o }) => (
          <button key={p.id} onClick={() => { setPresetId(p.id); setSupplierDraftPreset(null); }} className={`award-preset glass-card p-3 text-left text-sm ${p.id === presetId ? "award-preset-active" : ""}`}>
            <div className="text-xs text-[var(--bitter-500)]">{p.label}</div>
            <div className="num mt-1 text-lg font-semibold">{inrBig(o.totalAfterDiscountsInr)}</div>
            <div className="text-xs text-[var(--bitter-500)]">{o.byVendor.length} vendor{o.byVendor.length > 1 ? "s" : ""} · {o.unconfirmedCellsUsed} unconfirmed · {o.uncoveredLines.length} uncovered</div>
          </button>
        ))}
      </div>
      <details className="benchmark-details">
        <summary>Price-only benchmark · includes suppliers that did not clear qualification</summary>
        <p>This comparison shows the lowest quoted prices without the RFx quality gates. It is for understanding the price gap, not for making an award.</p>
        <button onClick={() => { setPresetId("all"); setSupplierDraftPreset(null); }}>Inspect benchmark · {inrBig(others.find(({ p }) => p.id === "all")!.r.totalAfterDiscountsInr)} <span aria-hidden="true">↗</span></button>
      </details></>}

      <div className="min-w-0 space-y-4">
        {presetId === "all" && <div className="benchmark-warning">Benchmark only: this view includes unqualified suppliers. Select a qualified scenario to export an award.</div>}
        {presetId !== "all" && openTerms.length > 0 && <button className="award-term-warning" onClick={() => setTab("review")}>{openTerms.length} awarded supplier {openTerms.length === 1 ? "term needs" : "terms need"} a buyer decision. Review terms ↗</button>}
        <section className="award-choice-summary"><div><small>SELECTED ALLOCATION</small><h3>{preset.label}</h3><p>{presetId === "vp" ? "Each item goes to its lowest-priced eligible supplier." : presetId === "one" ? "Place as many items as possible with one eligible supplier." : presetId === "two" ? "Use the lowest-cost allocation across no more than two eligible suppliers." : "Price comparison only. Some suppliers did not qualify."}</p></div><div className="award-choice-value"><strong>{inrBig(r.totalAfterDiscountsInr)}</strong><span>estimated annual value</span></div><div className="award-choice-vendors">{r.byVendor.map((vendor) => <div key={vendor.vendorId}><strong>{vendorName(vendor.vendorId)}</strong><span>{vendor.lines} items · {inrBig(vendor.valueInr)}</span></div>)}{r.uncoveredLines.length > 0 && <div><strong>Unassigned</strong><span>{r.uncoveredLines.length} items need a qualified quote</span></div>}</div></section>
        <details className="award-decision-checks"><summary>See price, capacity and eligibility checks</summary>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className={`award-summary-card p-4 text-sm ${rb.holds ? "award-summary-success" : "award-summary-warning"}`}>
            <div className="font-semibold">{rb.holds ? "✓ Decision holds" : "⚠ Confirm before awarding"}</div>
            <div className="mt-1">{rb.holds ? `No winner changes across ${rb.critical.length} tested price ${rb.critical.length === 1 ? "range" : "ranges"}.` : `${rb.critical.filter((c) => c.couldChangeWinner === true).length} price ${rb.critical.filter((c) => c.couldChangeWinner === true).length === 1 ? "value could" : "values could"} change the award${rb.unknown ? `; ${rb.unknown} cannot be bounded` : ""}. Review before awarding.`}</div>
          </div>
          <div className="glass-card p-4 text-sm">
            <div className="font-semibold">Split</div>
            {r.byVendor.map((b) => <div key={b.vendorId} className="mt-1 flex justify-between"><span>{vendorName(b.vendorId)} ({b.lines})</span><span className="num">{inrBig(b.valueInr)}</span></div>)}
            {r.discountsApplied.map((d, i) => <div key={i} className="mt-2 text-xs text-[var(--bitter-600)]">{vendorName(d.vendorId)}: {d.percent}% if {d.condition}: {d.met ? <b className="text-[var(--malachite-700)]">met, saves {inrBig(d.savingInr)}</b> : "not met"} ({d.monthlyTonnes} t/mo)</div>)}
            {r.lastYearSameLinesInr && <div className="mt-2 border-t border-[var(--bitter-100)] pt-2 text-xs text-[var(--bitter-600)]">Last year, same lines: <span className="num">{inrBig(r.lastYearSameLinesInr)}</span></div>}
          </div>
          <div className="glass-card p-4 text-sm">
            <div className="font-semibold">Capacity</div>
            {r.capacityNotes.length ? r.capacityNotes.map((n, i) => <div key={i} className="mt-1 text-[var(--international-orange-800)]">{n}</div>) : <div className="mt-1 text-[var(--bitter-600)]">Every awarded vendor has room for its share (spare capacity ≥ 1.5× awarded tonnes).</div>}
            {r.moqNotes.map((n, i) => <div key={`m${i}`} className="mt-1 text-[var(--international-orange-800)]">{n}</div>)}
          </div>
          <div className="glass-card p-4 text-sm">
            <div className="font-semibold">Not considered</div>
            {r.vendorsExcluded.length ? r.vendorsExcluded.map((x) => <div key={x.vendorId} className="mt-1 text-[var(--bitter-700)]">{vendorName(x.vendorId)}: {x.why}</div>) : <div className="text-[var(--bitter-500)]">None</div>}
          </div>
        </div>
        </details>
        <div className="flex flex-wrap gap-2">
          {presetId !== "all" && <button disabled={!r.byVendor.length} onClick={() => { setSelectedVendorId(r.byVendor[0]?.vendorId ?? null); setHandoffOpen(true); }} className="rounded-xl border border-[var(--amethyst-300)] bg-[var(--amethyst-50)] px-4 py-2 text-sm font-semibold text-[var(--amethyst-800)] disabled:opacity-40">Preview supplier handoffs</button>}
          {complete && presetId !== "all" && <button disabled={!r.byVendor.length} onClick={() => { setSupplierDraftPreset(presetId); openSupplierDraft(r.byVendor[0].vendorId); }} className="rounded-xl bg-[var(--amethyst-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{draftsReady ? "Review supplier drafts" : "Create supplier drafts"}</button>}
          <button disabled={!canExportAward} onClick={exportXlsx} className="rounded-xl bg-[var(--bitter-900)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Export award (Excel)</button>
          <button disabled={!complete || presetId === "all"} onClick={downloadMemo} className="rounded-xl border border-[var(--bitter-300)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Download decision memo</button>
        </div>
        {draftsReady && <section className="supplier-drafts" aria-label="Supplier contract drafts"><div className="supplier-drafts-heading"><div><h3>Supplier contract drafts</h3><p>One draft for each awarded supplier. Review each allocation and its open checks before approval.</p></div><span>{r.byVendor.length} drafts · Not issued</span></div><div className="supplier-drafts-grid">{r.byVendor.map((vendor, index) => <button key={vendor.vendorId} onClick={() => openSupplierDraft(vendor.vendorId)}><small>DRAFT {String(index + 1).padStart(2, "0")}</small><strong>{vendorName(vendor.vendorId)}</strong><span>{vendor.lines} items · {inrBig(vendor.valueInr)}</span><em>Review draft ↗</em></button>)}</div></section>}
        <div className="min-w-0">
          <div className="glass-card overflow-x-auto">
            <table className="w-full min-w-[690px] text-sm">
              <thead className="bg-[var(--bitter-100)] text-left text-xs text-[var(--bitter-600)]"><tr><th className="px-3 py-2">Line</th><th className="px-2 py-2">Awarded to</th><th className="px-2 py-2 text-right">Landed ₹/pc</th><th className="px-2 py-2 text-right">Annual</th><th className="px-2 py-2">Runner-up</th></tr></thead>
              <tbody>
                {r.lines.map((a) => (
                  <tr key={a.lineId} className="border-t border-[var(--bitter-100)]">
                    <td className="px-3 py-1.5"><div className="font-medium">{a.lineId}</div><div className="text-xs text-[var(--bitter-500)]">{line(a.lineId).description}</div></td>
                    <td className="px-2 py-1.5">{a.vendorId ? <button className="text-left underline decoration-stone-300" onClick={() => openSource(a.vendorId!, a.lineId)}>{vendorName(a.vendorId)}</button> : <span className="text-[var(--punch-700)]">No qualified quote</span>}{a.unconfirmed && <span className="ml-1 text-[var(--international-orange-700)]">⚠</span>}</td>
                    <td className="num px-2 py-1.5 text-right">{inr(a.unitPrice)}</td>
                    <td className="num px-2 py-1.5 text-right">{inrBig(a.annualValue)}</td>
                    <td className="px-2 py-1.5 text-xs text-[var(--bitter-500)]">{a.runnerUp ? `${vendorName(a.runnerUp.vendorId)} ${inr(a.runnerUp.unitPrice)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="glass-card mt-3 p-4">
            <summary className="cursor-pointer text-sm font-medium">Award memo (preview)</summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{memo}</pre>
          </details>
        </div>
      </div>
      {handoffOpen && selectedVendor && createPortal(<div className="award-handoff-backdrop" onClick={() => setHandoffOpen(false)}><section className="award-handoff-modal" role="dialog" aria-modal="true" aria-labelledby="award-handoff-title" onClick={(event) => event.stopPropagation()}>
        <div className="award-handoff-head"><div><small>{draftsReady ? "SUPPLIER CONTRACT DRAFTS" : "AWARD HANDOFF · PREVIEW"}</small><h2 id="award-handoff-title">{draftsReady ? "Review supplier drafts" : "Supplier allocations"}</h2><p>{preset.label} · {draftsReady ? `${r.byVendor.length} separate drafts · not issued` : complete ? "All replies received" : `${receivedVendorIds.length} of ${vendorIds.length} replies received · provisional`}</p></div><button onClick={() => setHandoffOpen(false)} aria-label="Close supplier handoffs">✕</button></div>
        <div className="award-handoff-body"><div className="award-handoff-vendors" role="tablist" aria-label="Awarded suppliers">{r.byVendor.map((vendor) => <button key={vendor.vendorId} role="tab" aria-selected={vendor.vendorId === selectedVendor.vendorId} className={vendor.vendorId === selectedVendor.vendorId ? "active" : ""} onClick={() => setSelectedVendorId(vendor.vendorId)}><strong>{vendorName(vendor.vendorId)}</strong><span>{vendor.lines} items · {inrBig(vendor.valueInr)}</span></button>)}</div>
          <div className="award-handoff-detail" role="tabpanel"><div className="supplier-draft-identity"><strong>{vendorName(selectedVendor.vendorId)}</strong><span>{draftsReady ? "Draft contract · Awaiting buyer review" : "Proposed allocation · Preview"}</span></div><div className="award-handoff-metrics"><div><span>Items allocated</span><strong>{selectedLines.length}</strong></div><div><span>Annual quantity</span><strong>{selectedLines.reduce((sum, award) => sum + award.annualQty, 0).toLocaleString("en-IN")} pieces</strong></div><div><span>Annual value after applicable discounts</span><strong>{inrBig(selectedNetValue)}</strong></div></div>
            {selectedDiscount.length > 0 && <p className="award-handoff-note">{selectedDiscount.map((discount) => `${discount.percent}% discount applies when ${discount.condition}`).join(" · ")}</p>}
            <h3>Before this can be issued</h3><ul className="award-handoff-checks">{selectedChecks.length ? selectedChecks.map((check) => <li key={check}>{check}</li>) : <li>No open checks found for this allocation. Buyer approval is still required.</li>}</ul>
            {selectedTerms?.flags.length ? <details className="award-handoff-terms"><summary>Commercial terms · {selectedDecision?.status === "accepted" ? "accepted by buyer" : "needs review"}</summary><ul>{selectedTerms.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul></details> : null}
            <h3>Allocated items</h3><div className="award-handoff-table-wrap"><table><thead><tr><th>Item</th><th>Annual qty</th><th>Landed ₹/piece</th><th>Annual value</th></tr></thead><tbody>{selectedLines.map((award) => <tr key={award.lineId}><td><button onClick={() => { setHandoffOpen(false); openSource(selectedVendor.vendorId, award.lineId); }}>{line(award.lineId).description}</button><small>{award.lineId}{award.unconfirmed ? " · Verify source" : ""}</small></td><td>{award.annualQty.toLocaleString("en-IN")}</td><td>{inr(award.unitPrice)}</td><td>{inrBig(award.annualValue)}</td></tr>)}</tbody></table></div>
          </div></div><div className="award-handoff-foot"><span>{draftsReady ? "Draft only · Awaiting buyer approval. Nothing has been issued." : "Preview only · No contract or PO is sent."}</span><button onClick={() => setHandoffOpen(false)}>Close</button></div>
      </section></div>, document.body)}
      <p className="text-xs text-[var(--bitter-500)]">Comparison updated {new Date(run.ranAt).toLocaleString("en-IN")}.</p>
    </div>
  );
}
