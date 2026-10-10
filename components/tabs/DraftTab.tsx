"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useWS } from "../WorkspaceContext";
import { dimsLabel, type LineSpec } from "@/lib/domain/spec";
import type { Draft } from "@/lib/copilot";
import type { Question } from "@/data/rfx";

/** The prepared example replies only fit the prepared brief, so sending is allowed when the draft still matches it. */
export function draftReady(draft: Draft["draft"] | null, lines: LineSpec[], questions: Question[], terms: string[]) {
  const matches = !!draft && draft.lines.length === lines.length &&
    draft.terms.length === terms.length && draft.terms.every((term, index) => term.trim() === terms[index].trim()) &&
    draft.questionnaire.length === questions.length && draft.questionnaire.every((item, index) =>
      item.question.trim() === questions[index].text.trim() && item.must_have === questions[index].mustHave &&
      item.pass_rule.trim() === (questions[index].passRule ?? "").trim()) &&
    draft.lines.every((item) => {
      const original = lines.find((line) => line.id === item.id);
      return !!original && item.description.trim() === original.description.trim() && item.style === original.style &&
        item.unit.toLowerCase().trim() === "per piece" && item.inner_dims_mm === dimsLabel(original) && item.ply === original.ply &&
        item.bf === original.bf && item.gsm_layers === original.gsmLayers.join("/") &&
        item.annual_qty === original.annualQty && item.print_colours === original.printColours;
    });
  return matches && !!draft && draft.open_questions.length === 0;
}

export function DraftTab({ onAddSuppliers }: { onAddSuppliers?: () => void } = {}) {
  const { lines, questions, terms, buyer, vendorIds, vendorName, workingDraft: draft, setWorkingDraft, draftDestination, setDraftDestination, sendRfx, draftApprovalAt, draftBusy, tourPreview, setTourPreview, tourEditOpen, setTourEditOpen } = useWS();
  const [localPreview, setLocalPreview] = useState<"items" | "questions" | "terms" | "email" | "suppliers" | null>(null);
  const [localEditing, setLocalEditing] = useState(false);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<string | null>(null);
  const [editDestination, setEditDestination] = useState<string | null>(null);
  const readyToDispatch = draftReady(draft, lines, questions, terms);
  const preview = tourPreview ?? localPreview;
  const editing = tourEditOpen || localEditing;
  const closePreview = () => { setLocalPreview(null); setTourPreview(null); };
  const closeEditor = () => { setLocalEditing(false); setTourEditOpen(false); setEditTitle(null); setEditScope(null); setEditDestination(null); };
  const openEditor = () => { if (!draft) return; setEditTitle(draft.title); setEditScope(draft.scope); setEditDestination(draftDestination); setLocalEditing(true); };
  const saveEdit = () => { if (!draft) return; const title = editTitle ?? draft.title; const scope = editScope ?? draft.scope; const destination = editDestination ?? draftDestination; if (!title.trim() || !scope.trim() || !destination.trim()) return; setWorkingDraft({ ...draft, title: title.trim(), scope: scope.trim() }); setDraftDestination(destination.trim()); closeEditor(); };
  const sections = [
    { id: "items" as const, label: "Items and specifications", count: `${draft?.lines.length ?? lines.length} lines` },
    { id: "questions" as const, label: "Supplier qualification", count: `${draft?.questionnaire.length ?? questions.length} checks` },
    { id: "terms" as const, label: "Commercial terms", count: `${draft?.terms.length ?? terms.length} terms` },
    { id: "suppliers" as const, label: "Suppliers", count: `${vendorIds.length} recipients` },
    { id: "email" as const, label: "Email suppliers will receive", count: "" },
  ];

  return <div className="brief-stage">
    <section className="brief-doc" aria-label="RFx draft">
      <div className="brief-doc-top"><div><span className="eyebrow">{draftApprovalAt ? "SENT RFx" : draftBusy ? "AERA IS WRITING" : draft ? "LIVE DRAFT" : "BLANK RFx"}</span>{draft ? <div className="draft-summary"><div className="draft-summary-title"><h2>{draft.title}</h2>{!draftApprovalAt && <button onClick={openEditor} aria-label="Edit request name, description and delivery location" title="Edit request"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 4 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg></button>}</div><p>{draft.scope}</p></div> : <><h2>{draftApprovalAt ? buyer.title : draftBusy ? "Drafting your RFx…" : "Nothing here yet"}</h2><p>{draftBusy ? "Filling in items, specifications, supplier checks and terms from your conversation. This takes about a minute." : draftApprovalAt ? `Annual supply for ${draftDestination}` : "Start the conversation and Aera fills in the items, supplier checks and terms."}</p></>}</div>{draftApprovalAt && <span className="brief-state">Sent {new Date(draftApprovalAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}</div>
      {!draft && !draftApprovalAt ? <div className={`brief-skeleton ${draftBusy ? "is-busy" : ""}`} aria-hidden="true">
        {["Items and specifications", "Supplier qualification", "Commercial terms", "Email to suppliers"].map((label) => <div key={label}><span>{label}</span><i /><i /></div>)}
      </div> : <>
        <dl className="brief-facts"><div><dt>Items</dt><dd>{draft?.lines.length ?? lines.length} packaging lines</dd></div><div><dt>Supplier checks</dt><dd>{draft?.questionnaire.length ?? questions.length} questions</dd></div><div><dt>Quote basis</dt><dd>₹ per piece, ex-GST</dd></div><div><dt>Destination</dt><dd>{draftDestination}</dd></div></dl>
        {draftDestination.trim().toLowerCase() !== buyer.plant.trim().toLowerCase() && <p className="draft-destination-note">The prepared example supplier replies quote delivery to {buyer.plant}. Aera will flag that destination mismatch for verification after the simulated send.</p>}
        {!!draft?.open_questions.length && <div className="draft-questions"><strong>Before you send, confirm {draft.open_questions.length} {draft.open_questions.length === 1 ? "detail" : "details"} with Aera</strong><ul>{draft.open_questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
        <div className="creation-sections draft-section-list">{sections.map((section) => <div className="draft-section-row" key={section.id}><button onClick={() => setLocalPreview(section.id)}><strong>{section.label}</strong>{section.count && <em>{section.count}</em>}<span>Preview ↗</span></button></div>)}</div>
        {!draftApprovalAt && <div className="creation-send"><p>{readyToDispatch ? "Review the request before sending." : draft?.open_questions.length ? "Answer the open questions with Aera before sending." : "This demo's send and reply comparison use the prepared 30-item packaging brief."}</p><button disabled={!readyToDispatch} onClick={sendRfx} className="primary-action" title="This is a simulated send and will not actually send because it’s a demo. No emails will be read or leave the app.">Send to {vendorIds.length} suppliers <span aria-hidden="true">→</span></button></div>}
      </>}
    </section>
    {editing && createPortal(<div className="draft-preview-backdrop" onClick={closeEditor}><section className="draft-preview-modal draft-edit-modal" role="dialog" aria-modal="true" aria-labelledby="draft-edit-title" onClick={(event) => event.stopPropagation()}><div className="draft-preview-head"><h2 id="draft-edit-title">Edit request</h2><button onClick={closeEditor} aria-label="Close request editor">✕</button></div><form onSubmit={(event) => { event.preventDefault(); saveEdit(); }} className="draft-editable"><label>Request name<input autoFocus required value={editTitle ?? draft?.title ?? ""} onChange={(event) => setEditTitle(event.target.value)} /></label><label>Description<textarea required value={editScope ?? draft?.scope ?? ""} onChange={(event) => setEditScope(event.target.value)} rows={3} /></label><label>Delivery location<select required value={editDestination ?? draftDestination} onChange={(event) => setEditDestination(event.target.value)}><option value="Hosur plant, Tamil Nadu">HOS · Hosur plant, Tamil Nadu</option><option value="Hyderabad, Telangana">HYD · Hyderabad, Telangana</option><option value="Pune, Maharashtra">PUN · Pune, Maharashtra</option><option value="Mumbai, Maharashtra">BOM · Mumbai, Maharashtra</option></select></label><div className="draft-edit-actions"><button type="button" onClick={closeEditor}>Cancel</button><button type="submit" className="primary-action">Save</button></div></form></section></div>, document.body)}
    {preview && createPortal(<div className="draft-preview-backdrop" onClick={closePreview}><section className="draft-preview-modal" role="dialog" aria-modal="true" aria-label={sections.find((section) => section.id === preview)?.label} onClick={(event) => event.stopPropagation()}><div className="draft-preview-head"><div><span className="eyebrow">RFx DRAFT</span><h2>{sections.find((section) => section.id === preview)?.label}</h2></div><button onClick={closePreview} aria-label="Close preview">✕</button></div><div className="draft-preview-body">{preview === "items" ? <Lines rows={draft ? draft.lines.map((line) => [line.id, line.description, line.inner_dims_mm || "?", line.ply ? `${line.ply}-ply` : "?", String(line.bf || "?"), line.gsm_layers || "?", String(line.print_colours), line.annual_qty ? line.annual_qty.toLocaleString("en-IN") : "?"]) : lines.map((line) => [line.id, line.description, dimsLabel(line), `${line.ply}-ply ${line.flutes}`, String(line.bf), line.gsmLayers.join("/"), String(line.printColours), line.annualQty.toLocaleString("en-IN")])} /> : preview === "questions" ? <ol className="draft-preview-list">{(draft?.questionnaire ?? questions.map((question) => ({ question: question.text, must_have: question.mustHave, pass_rule: question.passRule ?? "" }))).map((question, index) => <li key={index}><strong>{question.question}</strong>{question.must_have && <small>Must-have · {question.pass_rule}</small>}</li>)}</ol> : preview === "terms" ? <ol className="draft-preview-list">{(draft?.terms ?? terms).map((term, index) => <li key={index}>{term}</li>)}</ol> : preview === "suppliers" ? <><ul className="draft-preview-list">{vendorIds.map((id) => <li key={id}>{vendorName(id)}{id === "F" ? " · manual reply" : ""}</li>)}</ul>{onAddSuppliers && <button className="draft-preview-add" onClick={() => { closePreview(); onAddSuppliers(); }}>Add more suppliers</button>}</> : <div className="creation-email"><strong>Subject: {buyer.rfxId}: {draft?.title ?? buyer.title}</strong><p>To: {vendorIds.map(vendorName).join(", ")}</p><p>Dear supplier, please quote for the attached Corrugated Packaging requirements and complete the quality questionnaire by {buyer.replyBy}. Prices should be in INR per piece, ex-GST, delivered to {draftDestination}.</p><small>Attachments: line specifications · quality questionnaire</small></div>}</div></section></div>, document.body)}
  </div>;
}

function Lines({ rows }: { rows: string[][] }) {
  return <div className="brief-table" aria-label="RFx line items; scroll horizontally for all specifications"><table><thead><tr>{["Id", "Item", "Inner mm", "Ply", "BF", "GSM", "Col", "Qty/yr"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
