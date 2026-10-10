"use client";
// The whole product is this conversation. Aera drafts the RFx, reports replies as they arrive, explains what it found,
// and answers questions. Anything with detail (the RFx, a reply, the comparison, the award) opens as a window on the right.
import { useEffect, useMemo, useRef, useState } from "react";
import { useWS, type Win } from "../WorkspaceContext";
import { AnswerCard } from "../tabs/AskTab";
import { draftReady } from "../tabs/DraftTab";
import { api } from "@/lib/client-api";
import { buildInsights } from "@/lib/insights";
import { dimsLabel } from "@/lib/domain/spec";
import type { AnalystAnswer } from "@/lib/analyst";
import type { Draft } from "@/lib/copilot";

const STARTERS = [
  "I need an annual Corrugated Packaging RFx for our Hosur plant. Use our 30-item specification and tell me what I need to confirm.",
];
const INSIGHT_QUESTION = "Give me insights only on supplier replies.";

interface DraftTurn { q: string; reply?: string; error?: string }
interface AskTurn { q: string; a?: AnalystAnswer; reply?: string; error?: string }

export function Chat({ onStart, launchPrompt }: { onStart?: () => void; launchPrompt?: { id: number; text: string } | null } = {}) {
  const ws = useWS();
  const { stage, workingDraft, setWorkingDraft, setDraftBusy, buyer, lines, questions, terms, vendorIds, vendorName, run, cells, ctx, overrides, openPanel, sendRfx, receiveNextReply, draftApprovalAt, repliesIn, demoSupplierCount, receivedVendorIds, termDecisions, focus, setFocus, pendingQuestion, takePendingQuestion } = ws;
  const [draftTurns, setDraftTurns] = useState<DraftTurn[]>([]);
  const [askTurns, setAskTurns] = useState<AskTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const empty = stage === "brief" && draftTurns.length === 0;
  const ready = draftReady(workingDraft, lines, questions, terms);
  const suggestedQuestions = stage === "workspace" ? [INSIGHT_QUESTION, "Which prices should I verify against the original replies?", "Which suppliers failed the quality checks?", "What could change the award decision?"]
    : stage === "replies" ? ["Which values are blank or unreadable?", "Who has responded so far?", "What do we know from last year's prices?"]
    : draftTurns.length && !draftApprovalAt ? ["What should I change before sending?", "Which specifications or terms still need my confirmation?", "Show me the email the suppliers will receive."] : [];

  const insights = useMemo(() => stage === "workspace" ? buildInsights({
    ctx, cells, vendorIds, vendorName, questionnaire: run.questionnaire, terms: run.terms, lineCount: lines.length,
    acceptedTerms: Object.entries(termDecisions).filter(([, d]) => d.status === "accepted").map(([v]) => v),
  }) : [], [stage, ctx, cells, vendorIds, vendorName, run, lines.length, termDecisions]);

  const summaryRef = useRef<HTMLDivElement>(null);
  const prevStage = useRef(stage);
  useEffect(() => {
    // When the replies are all read, show the summary from its first line and put the comparison beside it.
    if (prevStage.current === "replies" && stage === "workspace") {
      openPanel({ kind: "compare" });
      requestAnimationFrame(() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    prevStage.current = stage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTurns, askTurns, repliesIn, stage]);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    onStart?.();
    if (!pendingQuestion) setFocus(null);
    setInput(""); setBusy(true);
    if (stage === "brief") {
      const history = draftTurns.flatMap((t) => [{ role: "user" as const, text: t.q }, ...(t.reply ? [{ role: "assistant" as const, text: t.reply }] : [])]);
      setDraftTurns((ts) => [...ts, { q }]);
      setDraftBusy(true);
      openPanel({ kind: "brief" });
      const prepared: Draft["draft"] = {
        title: buyer.title, scope: `Annual supply of Corrugated Packaging for ${ws.draftDestination}`,
        lines: lines.map((l) => ({ id: l.id, description: l.description, style: l.style, inner_dims_mm: dimsLabel(l), ply: l.ply, bf: l.bf, gsm_layers: l.gsmLayers.join("/"), print_colours: l.printColours, annual_qty: l.annualQty, unit: "per piece" })),
        questionnaire: questions.map((x) => ({ question: x.text, must_have: x.mustHave, pass_rule: x.passRule ?? "" })),
        terms, open_questions: [],
      };
      try {
        const usePreparedBrief = /corrugated|packaging/i.test(q);
        const r = await api<Draft>("/api/draft", { messages: [...history, { role: "user", text: q }], current: workingDraft ?? (usePreparedBrief ? prepared : null) });
        setWorkingDraft({ ...r.draft, title: r.draft.title.replace(/corrugated packaging/gi, "Corrugated Packaging") });
        setDraftTurns((ts) => ts.map((t, i) => i === ts.length - 1 ? { ...t, reply: r.reply } : t));
      } catch (e) {
        setDraftTurns((ts) => ts.map((t, i) => i === ts.length - 1 ? { ...t, error: (e as Error).message } : t));
      } finally { setBusy(false); setDraftBusy(false); }
      return;
    }
    if (/blank|missing|not quoted|unreadable|illegible|ocr|couldn.t read|uncertain/i.test(q)) {
      const received = new Set(receivedVendorIds);
      const gaps = cells.filter((cell) => received.has(cell.vendorId) && (cell.status === "missing" || cell.checks.some((check) => !check.ok && ["ocr", "legibility", "second_read"].includes(check.id))));
      if (gaps.length) setFocus({ label: "Blank or unreadable values", cells: gaps.map((cell) => `${cell.vendorId}|${cell.lineId}`) });
      openPanel({ kind: "compare" });
    }
    if (q.trim().toLowerCase() === INSIGHT_QUESTION.toLowerCase()) {
      setAskTurns((ts) => [...ts, { q, reply: "supplier-insights" }]);
      setBusy(false);
      return;
    }
    const history = askTurns.filter((t) => t.a).flatMap((t) => [{ role: "user" as const, text: t.q }, { role: "assistant" as const, text: t.a!.answer }]);
    setAskTurns((ts) => [...ts, { q }]);
    try {
      const a = await api<AnalystAnswer>("/api/ask", { question: q, history, overrides, run, ...(stage === "replies" ? { receivedVendorIds, expectedVendorCount: vendorIds.length } : {}) });
      setAskTurns((ts) => ts.map((t, i) => i === ts.length - 1 ? { ...t, a } : t));
    } catch (e) {
      setAskTurns((ts) => ts.map((t, i) => i === ts.length - 1 ? { ...t, error: (e as Error).message } : t));
    } finally { setBusy(false); }
  };

  const launched = useRef<number | null>(null);
  useEffect(() => {
    if (!launchPrompt || launched.current === launchPrompt.id || stage !== "brief") return;
    launched.current = launchPrompt.id;
    send(launchPrompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchPrompt, stage]);

  // Questions raised from an exception card or source detail land in this thread, once.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (pendingQuestion && pendingQuestion !== handled.current && stage !== "brief") {
      handled.current = pendingQuestion; takePendingQuestion(); send(pendingQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion, stage]);

  const composer = <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
    <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message Aera"
      placeholder={stage === "brief" ? "Describe what you need to source…" : stage === "replies" ? "Ask about replies or last year's prices…" : "Ask about prices, suppliers or the award…"} />
    <button disabled={busy || !input.trim()} aria-label="Send">{busy ? "…" : "↑"}</button>
  </form>;

  if (empty) {
    return <div className="chat chat-empty">
      <div className="chat-scroll chat-empty-scroll"><div className="chat-hero"><span className="chat-orb" aria-hidden="true">✦</span><h1>What do you need to source?</h1><p>Tell me what you need. I&apos;ll prepare the request with you.</p></div></div>
      <div className="chat-bottom"><div className="chat-bottom-suggestions chat-starters">{STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>{composer}</div>
    </div>;
  }

  return <div className="chat">
    <div className="chat-scroll">
      <div className="chat-thread">
        {draftTurns.map((t, i) => <div key={`d${i}`}>
          <User text={t.q} />
          {!t.reply && !t.error && <Thinking text="Drafting the RFx: items, specifications, supplier checks and terms. About a minute." />}
          {t.error && <Aera><p className="chat-error">I couldn&apos;t update the draft just now. Please try that again.</p></Aera>}
          {t.reply && <Aera>
            <p>{t.reply}</p>
            <WinCard win={{ kind: "brief" }} title={workingDraft?.title ?? "RFx draft"} meta={`${workingDraft?.lines.length ?? 0} items · ${workingDraft?.questionnaire.length ?? 0} supplier checks · ${workingDraft?.terms.length ?? 0} terms`} open={openPanel} />
            {i === draftTurns.length - 1 && !draftApprovalAt && ready && <div className="chat-actions"><button className="chat-primary" onClick={sendRfx} title="This is a simulated send and will not actually send because it’s a demo. No emails will be read or leave the app.">Send to {vendorIds.length} suppliers</button></div>}
          </Aera>}
        </div>)}

        {draftApprovalAt && <>
          {draftTurns.length === 0 && <Aera><p>This is the RFx for {buyer.title.toLowerCase()}.</p><WinCard win={{ kind: "brief" }} title={buyer.title} meta={`${lines.length} items · sent`} open={openPanel} /></Aera>}
          <p className="chat-reply-count">{receivedVendorIds.length} of {vendorIds.length} supplier {vendorIds.length === 1 ? "reply" : "replies"} received</p>
          {stage === "replies" && repliesIn < demoSupplierCount && <div className="chat-next-reply"><span>{receivedVendorIds.length} of {vendorIds.length} replies received</span><button onClick={receiveNextReply}>Next <span aria-hidden="true">→</span></button></div>}
        </>}

        {stage === "workspace" && <div ref={summaryRef} className="chat-anchor" />}

        {askTurns.map((t, i) => <div key={`a${i}`}>
          <User text={t.q} />
          {!t.a && !t.reply && !t.error && <Thinking text="Querying the comparison and running scenarios…" />}
          {t.error && <Aera><p className="chat-error">{t.error}</p></Aera>}
          {t.reply === "supplier-insights" ? <Aera><p className="computed-label">Computed from the received replies</p><ol className="chat-findings">{insights.filter((ins) => ins.id !== "award").map((ins) => <li key={ins.id} className={`cf-${ins.tone}`}><strong>{ins.title}.</strong> {ins.body} {ins.focus && <button onClick={() => { setFocus(focus?.label === ins.focus?.label ? null : ins.focus); openPanel({ kind: "compare" }); }}>{focus?.label === ins.focus.label ? "Clear highlight" : "Show me"}</button>}</li>)}</ol></Aera> : t.reply && <Aera><p>{t.reply}</p></Aera>}
          {t.a && <div className="chat-aera"><AnswerCard a={t.a} /></div>}
        </div>)}
        <div ref={endRef} />
      </div>
    </div>
    <div className="chat-bottom">{!!suggestedQuestions.length && <div className="chat-bottom-suggestions chat-suggest">{suggestedQuestions.map((question) => <button key={question} onClick={() => send(question)}>{question}</button>)}</div>}{composer}</div>
  </div>;
}

function User({ text }: { text: string }) { return <div className="chat-user">{text}</div>; }
function Aera({ children }: { children: React.ReactNode }) { return <div className="chat-aera"><span className="chat-name">Aera</span>{children}</div>; }
function Thinking({ text }: { text: string }) { return <div className="chat-thinking"><span className="pulse" />{text}</div>; }
function WinCard({ win, title, meta, open }: { win: Win; title: string; meta: string; open: (w: Win) => void }) {
  return <button className="win-card" onClick={() => open(win)}><span className="win-icon" aria-hidden="true">▤</span><span><strong>{title}</strong><small>{meta}</small></span><span className="win-open">View →</span></button>;
}

