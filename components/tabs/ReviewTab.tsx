"use client";
// The review queue, ordered by what matters: values that could change the award first.
// "Check these few, not all 150."
import { useMemo, useState } from "react";
import { useWS, type TermDecision } from "../WorkspaceContext";
import { robustness, vendorsFor } from "@/lib/scenario";
import { receivedCtx } from "@/lib/scenario/received";
import { PRESETS } from "@/lib/scenario/presets";
import { inr, inrBig, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";

export function ReviewTab() {
  const { ctx: allCtx, cells: allCells, openSource, openPanel, vendorName, receivedVendorIds, vendorIds: expectedVendorIds, questions, lines, run: allRun, askFromAnywhere, buyer, termDecisions, saveTermDecision } = useWS();
  const vendorIds = receivedVendorIds;
  const ctx = useMemo(() => receivedCtx(allCtx, vendorIds), [allCtx, vendorIds]);
  const cells = useMemo(() => allCells.filter((cell) => vendorIds.includes(cell.vendorId)), [allCells, vendorIds]);
  const run = useMemo(() => ({ ...allRun, terms: allRun.terms.filter((term) => vendorIds.includes(term.vendorId)), questionnaire: allRun.questionnaire.filter((item) => vendorIds.includes(item.vendorId)) }), [allRun, vendorIds]);
  const [presetId, setPresetId] = useState("vp");
  const [copiedTerm, setCopiedTerm] = useState<string | null>(null);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const rb = useMemo(() => robustness(preset.rule, ctx), [preset, ctx]);
  const { ok: inScope } = useMemo(() => vendorsFor(preset.rule, ctx), [preset, ctx]);

  const flagged = cells.filter((c) => c.status === "needs_review" || c.status === "carried");
  const critical = rb.critical.filter((c) => c.couldChangeWinner === true);
  const unknown = rb.critical.filter((c) => c.couldChangeWinner === null);
  const safeInScope = rb.critical.filter((c) => c.couldChangeWinner === false);
  const outOfScope = flagged.filter((c) => !inScope.includes(c.vendorId));
  const done = cells.filter((c) => c.status === "confirmed" || c.status === "overridden").length;
  const line = (id: string) => lines.find((l) => l.id === id)!;

  return (
    <div className="space-y-6">
      {receivedVendorIds.length < expectedVendorIds.length && <p className="partial-review-note">Provisional · {receivedVendorIds.length} of {expectedVendorIds.length} replies received. These checks will update as replies arrive.</p>}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-[var(--bitter-600)]">{cells.length} values read · <b>{flagged.length}</b> flagged · {done} checked by you</div>
            <div className="mt-1 text-xl font-semibold">
              {critical.length + unknown.length === 0
                ? "The current option holds across the received prices tested so far."
                : `Check ${critical.length + unknown.length} price value${critical.length + unknown.length > 1 ? "s" : ""} before you award.`}
            </div>
            <p className="mt-1 text-sm text-[var(--bitter-600)]">Price flags have been tested against plausible alternatives. Supplier terms and quality exceptions still need a buyer&apos;s judgment.</p>
            <details className="mt-2 text-xs text-[var(--bitter-600)]"><summary className="cursor-pointer font-medium text-[#871ad6]">How the price check works</summary><p className="mt-1 max-w-3xl">The award is recalculated at the edges of each plausible value range, including discounts. Ranges account for alternate readings, units, carried prices and freight. A spec deviation is checked by excluding that bid. Unbounded values require supplier clarification.</p></details>
          </div>
          <label className="block w-full min-w-0 text-sm sm:w-auto">
            <span className="mb-1 block text-xs text-[var(--bitter-500)]">Award rule being protected</span>
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="w-full max-w-full overflow-hidden rounded-md border border-[var(--bitter-300)] bg-white px-2 py-1.5 text-ellipsis sm:w-auto">
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <details className="quality-comparison glass-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Compare supplier qualification</summary>
        <div className="quality-comparison-scroll"><table><thead><tr><th>Requirement</th>{vendorIds.map((id) => <th key={id}><button onClick={() => openPanel({ kind: "supplier", vendorId: id })} title={vendorName(id)}>{vendorName(id)}</button></th>)}</tr></thead><tbody>{questions.map((question) => <tr key={question.id}><th>{question.text}{question.mustHave && <small>Must-have</small>}</th>{vendorIds.map((id) => { const verdict = run.questionnaire.find((item) => item.vendorId === id)?.verdicts.find((item) => item.question_id === question.id); return <td key={id} title={verdict?.evidence_quote || verdict?.reason || "No answer in the reply"}><button className={`quality-verdict v-${verdict?.verdict ?? "not_answered"}`} onClick={() => openPanel({ kind: "supplier", vendorId: id })}>{verdict?.verdict === "pass" ? "Pass" : verdict?.verdict === "fail" ? "Fail" : verdict?.verdict === "unclear" ? "Unclear" : "No answer"}</button></td>; })}</tr>)}</tbody></table></div>
        <p className="quality-comparison-note">Open a supplier to see the answer, evidence quote and attachments.</p>
      </details>

      <Group title="Could change the award: check these" tone="amber" empty={unknown.length ? "No value with a defensible range can flip a winner, but see the values that can't be bounded below." : "Nothing here: the award holds whichever way these values turn out."}>
        {critical.map((k) => {
          const c = cells.find((x) => x.vendorId === k.vendorId && x.lineId === k.lineId)!;
          return <Row key={`${k.vendorId}${k.lineId}`} c={c} extra={k.range ? `Plausible ${inr(k.range[0])}–${inr(k.range[1]).slice(1)} (${BOUND[k.bound]}) · ${inrBig(k.rupeesAtStake)} a year at stake` : `${BOUND[k.bound]}: the award changes if this bid is excluded`} onOpen={() => openSource(c.vendorId, c.lineId)} name={vendorName(c.vendorId)} desc={line(c.lineId).description} />;
        })}
      </Group>

      <Group title="Can't establish: no defensible range, ask the vendor" tone="amber" empty="Nothing here: every flagged value in scope could be bounded.">
        {unknown.map((k) => {
          const c = cells.find((x) => x.vendorId === k.vendorId && x.lineId === k.lineId)!;
          return <Row key={`${k.vendorId}${k.lineId}`} c={c} extra="The reply doesn't let us bound this value, and it could be decisive. Ask the vendor to confirm." onOpen={() => openSource(c.vendorId, c.lineId)} name={vendorName(c.vendorId)} desc={line(c.lineId).description} />;
        })}
      </Group>

      <Group title="Flagged, but can't change this award" tone="stone" empty="—" collapsed>
        {safeInScope.map((k) => {
          const c = cells.find((x) => x.vendorId === k.vendorId && x.lineId === k.lineId)!;
          return <Row key={`${k.vendorId}${k.lineId}`} c={c} extra={k.range ? `Even at ${inr(k.range[0])}–${inr(k.range[1]).slice(1)} (${BOUND[k.bound]}), no winner changes` : "Excluding this bid doesn't change any winner"} onOpen={() => openSource(c.vendorId, c.lineId)} name={vendorName(c.vendorId)} desc={line(c.lineId).description} />;
        })}
        {outOfScope.map((c) => (
          <Row key={`${c.vendorId}${c.lineId}`} c={c} extra={`Vendor not in this award rule (${run.questionnaire.find((q) => q.vendorId === c.vendorId)?.clears === "not_answered" ? "no questionnaire" : "failed quality"})`} onOpen={() => openSource(c.vendorId, c.lineId)} name={vendorName(c.vendorId)} desc={line(c.lineId).description} />
        ))}
      </Group>

      <section id="vendor-issues">
        <h2 className="mb-2 text-sm font-semibold">Commercial terms for eligible suppliers</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {run.terms.filter((t) => t.flags.length && inScope.includes(t.vendorId)).map((t) => (
            <TermCard key={t.vendorId} vendorId={t.vendorId} name={vendorName(t.vendorId)} flags={t.flags} decision={termDecisions[t.vendorId]} save={saveTermDecision} buyerId={buyer.rfxId} ask={askFromAnywhere} copied={copiedTerm === t.vendorId} setCopied={setCopiedTerm} />
          ))}
        </div>
      </section>
      <details className="glass-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Other supplier and quality issues · {run.questionnaire.filter((q) => q.clears !== "yes").length} suppliers need qualification review</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {run.terms.filter((t) => t.flags.length && !inScope.includes(t.vendorId)).map((t) => <div key={t.vendorId} className="rounded-xl border border-[var(--bitter-200)] p-3"><strong>{vendorName(t.vendorId)}</strong><ul className="mt-1 list-disc pl-5 text-[var(--bitter-700)]">{t.flags.map((flag, index) => <li key={index}>{flag}</li>)}</ul></div>)}
          {run.questionnaire.filter((q) => q.clears !== "yes").map((q) => <div key={`q${q.vendorId}`} className="rounded-xl border border-[var(--punch-200)] bg-[var(--punch-50)]/40 p-3"><strong>{vendorName(q.vendorId)}: {q.clears === "not_answered" ? "questionnaire unanswered" : "quality requirements not met"}</strong><ul className="mt-1 list-disc pl-5 text-[var(--bitter-700)]">{q.failedMustHaves.slice(0, 4).map((flag, index) => <li key={index}>{flag}</li>)}</ul></div>)}
        </div>
      </details>
    </div>
  );
}

export function TermCard({ vendorId, name, flags, decision, save, buyerId, ask, copied, setCopied }: { vendorId: string; name: string; flags: string[]; decision?: TermDecision; save: (vendorId: string, status: TermDecision["status"], note: string) => void; buyerId: string; ask: (question: string) => void; copied: boolean; setCopied: (vendorId: string | null) => void }) {
  const [note, setNote] = useState(decision?.note ?? "");
  const [needsNote, setNeedsNote] = useState(false);
  const record = (status: TermDecision["status"]) => {
    if (!note.trim()) { setNeedsNote(true); return; }
    setNeedsNote(false);
    save(vendorId, status, note);
  };
  return <div id={`term-${vendorId}`} className="glass-card p-4 text-sm">
    <div className="term-card-heading"><strong>{name}</strong><span className={decision?.status === "accepted" ? "term-state accepted" : decision?.status === "clarify" ? "term-state clarify" : "term-state"}>{decision?.status === "accepted" ? "Accepted by buyer" : decision?.status === "clarify" ? "Clarification needed" : "Needs buyer decision"}</span></div>
    <ul className="mt-1 list-disc pl-5 text-[var(--bitter-700)]">{flags.map((flag, index) => <li key={index}>{flag}</li>)}</ul>
    <label className="term-note-label" htmlFor={`note-${vendorId}`}>Your decision note</label>
    <textarea id={`note-${vendorId}`} value={note} onChange={(event) => { setNote(event.target.value); setNeedsNote(false); }} placeholder="Record the reason or the clarification you need" rows={2} className="term-note" />
    {needsNote && <p className="term-note-error">Add a short reason before recording a decision.</p>}
    <div className="term-actions"><button onClick={() => record("accepted")}>Accept term</button><button onClick={() => record("clarify")}>Needs clarification</button><button onClick={() => ask(`For ${buyerId}, how does this term from ${name} affect the award, and what should I confirm: ${flags.join(" ")}`)}>Ask Aera</button><button onClick={async () => { try { await navigator.clipboard.writeText(`Subject: Clarification for ${buyerId}\n\nDear ${name},\n\nBefore we finalise the award, please confirm: ${flags.join(" ")}\n\nRegards,\nWarner Procurement`); setCopied(vendorId); } catch { setCopied(null); } }}>{copied ? "Clarification copied" : "Copy clarification"}</button></div>
    {decision && <p className="term-recorded">Recorded {new Date(decision.at).toLocaleString("en-IN")}: {decision.note}</p>}
  </div>;
}

const BOUND: Record<string, string> = {
  two_readings: "both readings",
  unit_basis: "per piece vs per 100",
  per_kg_weight: "±10%: per-kg conversion uses an estimated box weight",
  last_year: "±10%: last year's price may have moved",
  freight_range: "freight range",
  eligibility: "spec deviation",
  default_15pct: "±15% default",
  unbounded: "no bound",
};

function Group({ title, tone, empty, children, collapsed }: { title: string; tone: "amber" | "stone"; empty: string; children: React.ReactNode; collapsed?: boolean }) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  const [open, setOpen] = useState(!collapsed);
  if (!items.length) return null;
  return (
    <section>
      <button onClick={() => setOpen(!open)} className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={tone === "amber" ? "text-[var(--international-orange-700)]" : "text-[var(--bitter-700)]"}>{title}</span>
        <span className="rounded-full bg-[var(--bitter-200)] px-2 text-xs">{items.length}</span>
        <span className="text-[var(--bitter-400)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (items.length ? <div className="glass-card divide-y divide-[var(--bitter-100)] overflow-hidden">{items}</div> : <p className="text-sm text-[var(--bitter-500)]">{empty}</p>)}
    </section>
  );
}

function Row({ c, extra, onOpen, name, desc }: { c: import("@/lib/pipeline/types").Cell; extra: string; onOpen: () => void; name: string; desc: string }) {
  return (
    <button onClick={onOpen} className="flex w-full flex-wrap items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bitter-50)]">
      <div className="min-w-0 flex-1">
        <div><b>{name}</b> · {c.lineId} <span className="text-[var(--bitter-500)]">{desc}</span></div>
        <div className="text-[var(--bitter-700)]">{c.reasons[0] ?? STATUS_LABEL[c.status]}{c.reasons.length > 1 ? ` (+${c.reasons.length - 1} more)` : ""}</div>
        <div className="text-xs text-[var(--bitter-500)]">{extra}</div>
      </div>
      <span className={`num rounded px-2 py-0.5 ${STATUS_STYLE[c.status]}`}>{inr(c.inrPerPiece)}</span>
    </button>
  );
}
