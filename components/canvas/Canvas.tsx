"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWS } from "../WorkspaceContext";
import { DraftTab } from "../tabs/DraftTab";
import { AwardTab } from "../tabs/AwardTab";
import { ReviewTab } from "../tabs/ReviewTab";
import { EvidenceTab } from "../tabs/EvidenceTab";
import { SupplierPanel } from "../panels/SupplierPanel";
import { ComparisonTable, DecideSection } from "../stages/WorkspaceStage";
import { RECEIVED, REPLY_SHAPE } from "../stages/replies-meta";
import { isFlagged } from "@/lib/insights";
import { inr } from "@/lib/format";
import { UploadReply } from "./UploadReply";

export type ArchivedRequest = { id: string; title: string; date: string; suppliers: number; location: string; status: string; replies: string; next: string; detail: string; items: number; terms: number; illustrative?: boolean };

export function Canvas({ archived = [], onAddSuppliers }: { archived?: ArchivedRequest[]; onAddSuppliers?: () => void }) {
  const { stage, target, openPanel, draftBusy, workingDraft, draftApprovalAt, draftDestination, buyer, vendorIds, vendorName, receivedVendorIds, cells, run, awardPreset } = useWS();
  const [activeOpen, setActiveOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [demoHint, setDemoHint] = useState<string | null>(null);
  const [today, setToday] = useState("Today");
  const top = useRef<HTMLDivElement>(null);
  const detail = target?.win;
  const inspector = detail?.kind === "supplier" || detail?.kind === "review" || detail?.kind === "award" || detail?.kind === "evidence";
  const receivedIds = receivedVendorIds;
  const receivedCells = cells.filter((cell) => receivedIds.includes(cell.vendorId));
  const qualifiedIds = receivedIds.filter((id) => run.questionnaire.find((item) => item.vendorId === id)?.clears === "yes");
  const flagged = new Set(receivedCells.filter((cell) => qualifiedIds.includes(cell.vendorId) && isFlagged(cell)).map((cell) => cell.lineId)).size;
  const missing = receivedCells.filter((cell) => cell.status === "missing").length;
  const outliers = receivedCells.filter((cell) => qualifiedIds.includes(cell.vendorId) && cell.checks.some((check) => !check.ok && (check.id === "history_drift" || check.id === "magnitude"))).length;
  const quality = receivedIds.filter((id) => run.questionnaire.find((item) => item.vendorId === id)?.clears !== "yes").length;
  const hasCurrentRequest = draftBusy || !!workingDraft || !!draftApprovalAt || stage !== "brief";

  useEffect(() => { if (!target) return; const frame = requestAnimationFrame(() => { setActiveOpen(true); top.current?.scrollTo({ top: 0, behavior: "smooth" }); }); return () => cancelAnimationFrame(frame); }, [target]);
  useEffect(() => { const frame = requestAnimationFrame(() => setToday(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))); return () => cancelAnimationFrame(frame); }, []);

  return <div className="canvas workbench" ref={top}>
    <div className="wb-head"><h1>Sourcing Requests</h1></div>
    <div className="history-nudge-wrap"><button className="history-nudge" onClick={() => setHistoryOpen(true)}><span className="history-nudge-icon" aria-hidden="true">✦</span><strong>Compare last year&apos;s prices</strong><span className="history-nudge-action">Compare ↗</span></button></div>
    <div className="request-list" aria-label="Sourcing requests">
      <div className="request-list-label"><strong>Active request</strong></div>
      {!hasCurrentRequest && <div className="request-empty"><strong>No active request</strong><span>Tell Aera what you need to source to start a request.</span></div>}
      {hasCurrentRequest &&
      <section className={`request-record request-current ${activeOpen ? "is-open" : ""}`}>
        <button className="request-row" aria-expanded={activeOpen} aria-controls="active-request-details" onClick={() => setActiveOpen(!activeOpen)}>
          <span className="request-row-main"><span className="request-row-kicker">CURRENT REQUEST · {draftApprovalAt ? new Date(draftApprovalAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : today}</span><span className="request-title-with-dot"><i className="request-live-dot" aria-hidden="true" /><strong>{workingDraft?.title ?? (draftApprovalAt ? buyer.title : "New sourcing request")}</strong></span><small>{buyer.rfxId} · {vendorIds.length} suppliers · {draftDestination}</small></span>
          <span className={`request-state ${stage === "workspace" ? "status-review" : stage === "replies" ? "status-awaiting" : "status-draft"}`}>{stage === "brief" ? draftBusy ? "Creating draft" : "Draft" : stage === "workspace" ? "Ready to review" : `${receivedVendorIds.length}/${vendorIds.length} replies`}</span><span className="request-expand">{activeOpen ? "Collapse" : "Expand"}</span>
        </button>
        {activeOpen && <div id="active-request-details" className="request-detail">
          {stage === "brief" && <div className="wb-primary wb-draft"><DraftTab onAddSuppliers={onAddSuppliers} /></div>}
          {stage !== "brief" && <ResponseWorkspace receivedIds={receivedIds} flagged={flagged} missing={missing} outliers={outliers} quality={quality} complete={stage === "workspace"} decisionOpen={decisionOpen} setDecisionOpen={setDecisionOpen} />}
        </div>}
      </section>}
      <div className="request-list-label"><strong>Earlier requests</strong></div>
      {[...archived, ...PAST_REQUESTS].map((request) => request.illustrative ? <div className="request-record request-past request-demo" key={request.id}><div className="request-row"><span className="request-row-main"><span className="request-row-kicker">{request.date}</span><strong>{request.title}</strong><small>{request.id} · {request.suppliers} suppliers · {request.location}</small></span><span className={`request-state ${request.status === "Awarded" ? "status-awarded" : request.status === "Review" ? "status-review" : "status-awaiting"}`}>{request.status}</span><button className="request-expand" onMouseEnter={() => setDemoHint(request.id)} onMouseLeave={() => setDemoHint(null)} onFocus={() => setDemoHint(request.id)} onBlur={() => setDemoHint(null)} onClick={() => setDemoHint(request.id)} aria-describedby={`demo-hint-${request.id}`}>View details</button></div><span id={`demo-hint-${request.id}`} className={`request-demo-tooltip ${demoHint === request.id ? "is-visible" : ""}`} role="tooltip">This is just demo data and cannot be expanded.</span></div> : <details className="request-record request-past" key={request.id}><summary className="request-row"><span className="request-row-main"><span className="request-row-kicker">{request.date} · THIS SESSION</span><strong>{request.title}</strong><small>{request.id} · {request.suppliers} suppliers · {request.location}</small></span><span className={`request-state ${request.status === "Ready to review" ? "status-review" : request.status === "Awaiting replies" ? "status-awaiting" : "status-draft"}`}>{request.status}</span><span className="request-expand">Expand</span></summary><div className="request-past-detail"><p>{request.detail}</p><dl><div><dt>Owner</dt><dd>Paul Mehta</dd></div><div><dt>Supplier replies</dt><dd>{request.replies}</dd></div><div><dt>Items</dt><dd>{request.items}</dd></div><div><dt>Terms</dt><dd>{request.terms}</dd></div><div><dt>Next step</dt><dd>{request.next}</dd></div></dl><small>Session snapshot. Source files and review decisions are not retained in this summary.</small></div></details>)}
    </div>

    {historyOpen && <div className="history-modal-backdrop" onClick={() => setHistoryOpen(false)}><section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" onClick={(event) => event.stopPropagation()}><div className="history-modal-head"><h2 id="history-modal-title">Last year&apos;s prices</h2><button autoFocus onClick={() => setHistoryOpen(false)} aria-label="Close last year's prices">✕</button></div><HistoryPanel /></section></div>}
    {inspector && <div className="wb-inspector-backdrop" onClick={() => openPanel(null)} onKeyDown={(event) => { if (event.key === "Escape") openPanel(null); }}>
      <aside className="wb-inspector" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} aria-label="Details">
        <div className="wb-inspector-head"><strong>{detail.kind === "supplier" ? vendorName(detail.vendorId) : detail.kind === "review" ? "Checks before award" : detail.kind === "award" ? "Award option" : "Method and evidence"}</strong><button autoFocus onClick={() => openPanel(null)} aria-label="Close details">✕</button></div>
        <div className="wb-inspector-body">{detail.kind === "supplier" ? <SupplierPanel vendorId={detail.vendorId} /> : detail.kind === "review" ? <ReviewTab /> : detail.kind === "award" ? <AwardTab key={detail.presetId ?? awardPreset ?? "vp"} initialPreset={detail.presetId ?? awardPreset ?? "vp"} embedded /> : <EvidenceTab />}</div>
      </aside>
    </div>}
  </div>;
}

const PAST_REQUESTS = [
  { id: "RFQ-FAC-2026-011", title: "Facilities maintenance services", date: "18 Sep 2026", suppliers: 4, location: "Pune", status: "Awaiting replies", replies: "2 of 4", next: "Follow up with two suppliers", detail: "Annual facilities maintenance scope across two sites.", items: 8, terms: 5, illustrative: true },
  { id: "RFQ-FLT-2026-008", title: "Fleet services renewal", date: "12 Aug 2026", suppliers: 5, location: "Mumbai", status: "Review", replies: "4 of 5", next: "Review service coverage", detail: "Renewal of regional transport and fleet support services.", items: 6, terms: 7, illustrative: true },
  { id: "RFQ-VAL-2026-003", title: "Industrial valves supply", date: "24 Jun 2026", suppliers: 3, location: "Hosur", status: "Awarded", replies: "3 of 3", next: "No action needed", detail: "Supply of industrial valves for the Hosur plant.", items: 12, terms: 6, illustrative: true },
];

function ResponseWorkspace({ receivedIds, flagged, missing, outliers, quality, complete, decisionOpen, setDecisionOpen }: { receivedIds: string[]; flagged: number; missing: number; outliers: number; quality: number; complete: boolean; decisionOpen: boolean; setDecisionOpen: (open: boolean) => void }) {
  const { cells, vendorIds, vendorName, openPanel, receiveNextReply, setFocus, openSource, draftDestination, buyer, run, storedRunAt } = useWS();
  const [responsesOpen, setResponsesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const receivedCells = cells.filter((cell) => receivedIds.includes(cell.vendorId));
  const inspect = (kind: "flagged" | "missing" | "outliers") => {
    const matches = receivedCells.filter((cell) => kind === "missing" ? cell.status === "missing" : run.questionnaire.find((item) => item.vendorId === cell.vendorId)?.clears === "yes" && (kind === "outliers" ? cell.checks.some((check) => !check.ok && (check.id === "history_drift" || check.id === "magnitude")) : isFlagged(cell)));
    if (!matches.length) return;
    setFocus({ label: kind === "missing" ? "Not quoted" : kind === "outliers" ? "Price outliers" : "Rows needing a second look", cells: matches.map((cell) => `${cell.vendorId}|${cell.lineId}`) });
    openSource(matches[0].vendorId, matches[0].lineId);
  };
  return <div className="wb-primary wb-results wb-response-workspace">
    <div className="wb-table-heading"><h2>{receivedIds.length ? "Compare received quotes" : "While you wait"}</h2>{!receivedIds.length && <UploadReply />}</div>
    {receivedIds.length ? <ComparisonTable visibleVendorIds={receivedIds} allowUpload /> : <div className="wb-awaiting"><p>No supplier prices to compare yet. Aera will build the table as responses arrive.</p></div>}
    <div className="wb-overview">
    <div className="wb-result-cards">
      <div className="wb-responses-card" onMouseEnter={() => setResponsesOpen(true)} onMouseLeave={() => setResponsesOpen(false)} onKeyDown={(event) => { if (event.key === "Escape") setResponsesOpen(false); }}>
        <button className="wb-responses-trigger" title={`The five prepared replies were read by real models on ${new Date(storedRunAt).toLocaleString("en-IN")}. New uploads are read live.`} aria-expanded={responsesOpen} aria-controls="wb-response-details" onClick={() => setResponsesOpen(true)}><span>Responses received <i aria-hidden="true">⌄</i></span><strong>{receivedIds.length}/{vendorIds.length}</strong><small>{complete ? "Prepared replies · live uploads" : "View supplier replies"}</small></button>
        <div id="wb-response-details" className={`wb-response-popover ${responsesOpen ? "is-open" : ""}`} aria-hidden={!responsesOpen}><div className="wb-response-popover-head"><strong>Supplier responses</strong><span>{receivedIds.length} of {vendorIds.length} received</span><button onClick={() => setResponsesOpen(false)} aria-label="Close supplier responses">✕</button></div><ol>{vendorIds.map((id) => {
          const received = receivedIds.includes(id);
          const vendorCells = cells.filter((cell) => cell.vendorId === id);
          const gaps = vendorCells.filter((cell) => isFlagged(cell) || cell.status === "missing").length;
          return <li key={id}><button tabIndex={responsesOpen && received ? 0 : -1} disabled={!received} onClick={() => { setResponsesOpen(false); openPanel({ kind: "supplier", vendorId: id }); }}><span className={`wb-inbox-dot ${received ? "arrived" : ""}`} /><span><strong>{vendorName(id)}</strong><small>{received ? `${RECEIVED[id] ?? "Received"} · ${REPLY_SHAPE[id] ?? "Response"}` : id === "F" ? "Awaiting manual reply" : "Awaiting response"}</small></span>{received && <em>{gaps} {gaps === 1 ? "gap" : "gaps"}</em>}</button></li>;
        })}</ol>{!complete && <div className="wb-response-popover-actions"><button onClick={receiveNextReply}>Next reply</button></div>}</div>
      </div>
      <div><button className="wb-stat-action" onClick={() => inspect("flagged")} disabled={!flagged}><span>Qualified rows to check</span><strong>{flagged}</strong><small>Only award-eligible suppliers ↗</small></button></div>
      <div><button className="wb-stat-action" onClick={() => openPanel({ kind: "review" })} disabled={!quality}><span>Quality checks</span><strong>{quality}</strong><small>Suppliers with an open check ↗</small></button></div>
      <div><button className="wb-stat-action" onClick={() => inspect("outliers")} disabled={!outliers}><span>Qualified price outliers</span><strong>{outliers}</strong><small>Open source evidence ↗</small></button></div>
      <div><button className="wb-stat-action" onClick={() => inspect("missing")} disabled={!missing}><span>Not quoted</span><strong>{missing}</strong><small>Open missing values and source ↗</small></button></div>
      <div><button className="wb-stat-action" onClick={() => setDeliveryOpen(true)}><span>Delivery basis</span><strong>{draftDestination.trim().toLowerCase() === buyer.plant.trim().toLowerCase() ? "Matched" : "Check"}</strong><small>{draftDestination.trim().toLowerCase() === buyer.plant.trim().toLowerCase() ? "Destination aligned ↗" : "Request and replies differ ↗"}</small></button></div>
    </div>
    {receivedIds.length >= 2 && <div className="wb-actions"><div><button aria-expanded={reviewOpen} aria-controls="wb-review-checks" onClick={() => { setReviewOpen(!reviewOpen); setDecisionOpen(false); }}>Review checks <span aria-hidden="true">⌄</span></button><button className="wb-explore" aria-expanded={decisionOpen} aria-controls="wb-award-options" onClick={() => { setDecisionOpen(!decisionOpen); setReviewOpen(false); }}>Explore award options <span aria-hidden="true">⌄</span></button></div></div>}
    </div>
    {receivedIds.length >= 2 && <div id="wb-review-checks" className={`wb-decision-reveal ${reviewOpen ? "is-open" : ""}`} aria-hidden={!reviewOpen}><div><div className="wb-review-inline"><ReviewTab /></div></div></div>}
    {receivedIds.length >= 2 && <div id="wb-award-options" className={`wb-decision-reveal ${decisionOpen ? "is-open" : ""}`} aria-hidden={!decisionOpen}><div><div className="wb-decision"><DecideSection /></div></div></div>}
    {deliveryOpen && createPortal(<div className="upload-reply-backdrop" onClick={() => setDeliveryOpen(false)}><section className="upload-reply-modal delivery-basis-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-basis-title" onClick={(event) => event.stopPropagation()}><div className="upload-reply-head"><div><h2 id="delivery-basis-title">Delivery basis</h2><p>Request destination: {draftDestination}</p></div><button onClick={() => setDeliveryOpen(false)} aria-label="Close delivery basis">✕</button></div>{draftDestination.trim().toLowerCase() !== buyer.plant.trim().toLowerCase() && <p>Prepared supplier replies refer to {buyer.plant}. Confirm the destination before relying on landed costs.</p>}<ul>{receivedIds.map((id) => { const freight = run.terms.find((term) => term.vendorId === id)?.freight; return <li key={id}><strong>{vendorName(id)}</strong><span>{freight?.kind === "delivered" ? "Delivery included" : freight?.kind === "extra_stated" ? `Freight extra${freight.inrPerKg != null ? ` · ₹${freight.inrPerKg}/kg` : ""}` : freight?.kind === "extra_unknown" ? "Freight extra · amount to confirm" : "Delivery terms not stated"}</span></li>; })}</ul><div className="draft-edit-actions"><button className="primary-action" onClick={() => setDeliveryOpen(false)}>Close</button></div></section></div>, document.body)}
  </div>;
}

function HistoryPanel() {
  const { reference, lines, vendorName } = useWS();
  const history = reference.history;
  const priorVendors = [...new Set(history.map((h) => h.vendorId))];
  return <aside className="wb-history wb-card">
    <p className="wb-explainer">FY 2025–26 · {history.length} prices from two prior purchase orders. Historical reference, not current bids.</p>
    <div className="wb-history-scroll"><table><thead><tr><th>Item</th>{priorVendors.map((v) => <th key={v}>{vendorName(v)}</th>)}</tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td><strong>{line.description}</strong><small>{line.id}</small></td>{priorVendors.map((v) => { const h = history.find((x) => x.vendorId === v && x.lineId === line.id); return <td key={v} title={h?.ref ?? "No prior price"}>{h ? <><strong>{inr(h.inrPerPiece)}</strong><small>₹ / piece</small></> : "—"}</td>; })}</tr>)}</tbody></table></div>
    <p className="wb-history-source">Sources: {[...new Set(history.map((h) => h.ref))].join(" · ")}</p>
  </aside>;
}
