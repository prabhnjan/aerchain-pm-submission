"use client";

import { useMemo } from "react";
import { useWS } from "../WorkspaceContext";
import { runScenario, robustness } from "@/lib/scenario";
import { PRESETS } from "@/lib/scenario/presets";
import { inr, inrBig } from "@/lib/format";

const splitPreset = PRESETS.find((preset) => preset.id === "vp")!;
const singlePreset = PRESETS.find((preset) => preset.id === "one")!;

export function OverviewTab() {
  const { buyer, ctx, cells, lines, run, vendorIds, vendorName, setTab, openSource, openResponses, setCopilotOpen, termDecisions } = useWS();
  const split = useMemo(() => runScenario(splitPreset.rule, ctx), [ctx]);
  const single = useMemo(() => runScenario(singlePreset.rule, ctx), [ctx]);
  const check = useMemo(() => robustness(splitPreset.rule, ctx), [ctx]);
  const decisiveValues = check.critical.filter((item) => item.couldChangeWinner !== false);
  const awardedTerms = run.terms.filter((term) => split.byVendor.some((vendor) => vendor.vendorId === term.vendorId) && term.flags.length && termDecisions[term.vendorId]?.status !== "accepted");
  const singleIsCheaper = single.uncoveredLines.length === 0 && !single.moqNotes.some((note) => note.startsWith("BLOCKER")) && single.totalAfterDiscountsInr < split.totalAfterDiscountsInr;
  const savings = split.totalAfterDiscountsInr - single.totalAfterDiscountsInr;
  const actionCount = awardedTerms.length + decisiveValues.length + (singleIsCheaper ? 1 : 0);
  const qualified = vendorIds.filter((vendorId) => run.questionnaire.find((q) => q.vendorId === vendorId)?.clears === "yes");
  const previewLines = lines.slice(0, 5);
  const openTerm = (vendorId: string) => {
    setTab("review");
    requestAnimationFrame(() => document.getElementById(`term-${vendorId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return <div className="journey-home">
    <section className="journey-heading" aria-label="Current sourcing event"><div><span className="eyebrow">SUPPLIER RESPONSES ARE IN</span><h1>Corrugated packaging</h1><p>Five suppliers have responded to your RFx. Aera has read their files and prepared a side-by-side view.</p><div className="journey-chips"><span>{buyer.rfxId}</span><span>Annual supply · FY 2026–27</span><span>{buyer.plant}</span></div></div><button onClick={() => setTab("draft")}>View the RFx you sent <span aria-hidden="true">↗</span></button></section>

      <section className="glass-card journey-inbox" aria-labelledby="inbox-title"><div className="journey-card-heading"><div><span className="eyebrow">01 · RESPONSES</span><h2 id="inbox-title">The five replies</h2><p>Open any supplier to see its original file and what Aera read.</p></div><button onClick={() => setTab("responses")}>Open inbox ↗</button></div>
        <div className="journey-supplier-list">{vendorIds.map((vendorId) => {
          const vendorCells = cells.filter((cell) => cell.vendorId === vendorId);
          const priced = vendorCells.filter((cell) => cell.inrPerPiece != null).length;
          const status = run.questionnaire.find((item) => item.vendorId === vendorId)?.clears;
          const flags = vendorCells.filter((cell) => cell.status === "needs_review" || cell.status === "carried").length;
          return <button key={vendorId} onClick={() => openResponses(vendorId)} className="journey-supplier"><span className="supplier-monogram">{vendorName(vendorId).slice(0, 1)}</span><span className="journey-supplier-name"><strong>{vendorName(vendorId)}</strong><small>{priced} of {lines.length} items quoted{flags ? ` · ${flags} ${flags === 1 ? "value needs" : "values need"} a closer look` : ""}</small></span><span className={`supplier-result ${status === "yes" ? "qualified" : status === "no" ? "not-qualified" : "unconfirmed"}`}>{status === "yes" ? "Meets requirements" : status === "no" ? "Did not qualify" : "Awaiting qualification"}</span><span aria-hidden="true">↗</span></button>;
        })}</div>
      </section>


    <section className="glass-card journey-comparison" aria-labelledby="comparison-title"><div className="journey-card-heading"><div><span className="eyebrow">02 · AERA&apos;S COMPARISON</span><h2 id="comparison-title">The quotes, on one basis</h2><p>Aera lined up the same {lines.length} requested items, converted prices to delivered INR per piece, and checked the supplier questionnaire. {qualified.length} suppliers meet every must-have.</p></div><button onClick={() => setTab("compare")}>Open all {lines.length} items ↗</button></div>
      <div className="journey-table-wrap"><table className="journey-table"><thead><tr><th>Requested item</th><th>Annual quantity</th>{qualified.map((vendorId) => <th key={vendorId}>{vendorName(vendorId)}<small>Delivered INR / piece</small></th>)}</tr></thead><tbody>{previewLines.map((line) => <tr key={line.id}><td><strong>{line.description}</strong><small>{line.id}</small></td><td>{line.annualQty.toLocaleString("en-IN")}</td>{qualified.map((vendorId) => { const cell = cells.find((item) => item.vendorId === vendorId && item.lineId === line.id); return <td key={vendorId}>{cell?.inrPerPiece != null ? inr(cell.inrPerPiece) : "No quote"}{cell?.status === "needs_review" || cell?.status === "carried" ? <small className="table-review">Check source</small> : null}</td>; })}</tr>)}</tbody></table></div>
      <div className="journey-comparison-footer"><span>The complete comparison retains the source quote, unit conversion and review status for every value.</span><button onClick={() => setTab("compare")}>Inspect comparison ↗</button></div>
    </section>

      <section className="glass-card journey-attention" aria-labelledby="attention-title"><div className="journey-card-heading"><div><span className="eyebrow">03 · YOUR JUDGMENT</span><h2 id="attention-title">{actionCount ? `${actionCount} decisions remain yours` : "Ready for your decision"}</h2><p>Aera points to what matters; you decide what to accept.</p></div></div>
        <div className="journey-attention-list">
          {singleIsCheaper && <button onClick={() => setTab("award")}><span className="attention-symbol">↗</span><span><strong>A single supplier could cost {inrBig(savings)} less</strong><small>The discount applies at this volume. Decide whether that saving is worth relying on one supplier.</small></span></button>}
          {awardedTerms.map((term) => <button key={term.vendorId} onClick={() => openTerm(term.vendorId)}><span className="attention-symbol term">!</span><span><strong>Confirm {vendorName(term.vendorId)}&apos;s terms</strong><small>{term.flags[0]}</small></span></button>)}
          {decisiveValues.slice(0, 2).map((item) => <button key={`${item.vendorId}-${item.lineId}`} onClick={() => openSource(item.vendorId, item.lineId)}><span className="attention-symbol value">?</span><span><strong>Check {item.lineId} from {vendorName(item.vendorId)}</strong><small>This value could change the award. Open the source and confirm it.</small></span></button>)}
          {actionCount === 0 && <p className="journey-clear">No award-changing price issues or open supplier terms under the current split.</p>}
        </div><button className="journey-link" onClick={() => setTab("review")}>See all checks and source evidence ↗</button>
      </section>


    <section className="journey-decision"><div><span className="eyebrow">04 · DECIDE</span><h2>Choose an award you can explain.</h2><p>The qualified split covers all {lines.length} items at {inrBig(split.totalAfterDiscountsInr)} a year. Compare it with other eligible allocations, then record the choice and its assumptions.</p></div><div><button onClick={() => setTab("award")}>Compare award options <span aria-hidden="true">↗</span></button><button className="journey-ask" onClick={() => setCopilotOpen(true)}>Ask Aera about the trade-offs</button></div></section>
  </div>;
}
