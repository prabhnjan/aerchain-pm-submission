"use client";
// Natural-language analysis. The model plans; tools compute; every number is checked against tool output.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useWS } from "../WorkspaceContext";
import { api } from "@/lib/client-api";
import type { AnalystAnswer, Artifact } from "@/lib/analyst";
import type { Draft } from "@/lib/copilot";
import { dimsLabel } from "@/lib/domain/spec";

const Chart = dynamic(() => import("../Chart"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-[var(--bitter-100)]" /> });

const SUGGESTED = [
  "What if we split it, cheapest per line, but only among vendors who cleared the quality questionnaire?",
  "Navkar looks 25% cheaper. Is it really?",
  "Which numbers should I check before I award, and why?",
  "Best award with at most 2 vendors? Show a chart of the split.",
  "Compare landed cost vs last year for the top 5 lines by spend.",
  "What happens to the award if Kaveri doesn't hit 5 MT a month?",
];
const DRAFT_SUGGESTED = [
  "I need an annual corrugated packaging RFx for our Hosur plant. Use our 30-item specification and tell me what I need to confirm.",
  "Make sure every supplier quotes in INR per piece, ex-GST and delivered to Hosur.",
];

interface Turn { q: string; a?: AnalystAnswer; error?: string }
interface DraftTurn { q: string; reply?: string; error?: string }

export function AskTab({ compact = false }: { compact?: boolean }) {
  const { overrides, run, pendingQuestion, takePendingQuestion, stage, workingDraft, setWorkingDraft, setDraftBusy, buyer, lines, questions, terms, vendorIds, draftApprovalAt } = useWS();
  const drafting = stage === "brief";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draftTurns, setDraftTurns] = useState<DraftTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setInput("");
    if (drafting) {
      const history = draftTurns.flatMap((turn) => [
        { role: "user" as const, text: turn.q },
        ...(turn.reply ? [{ role: "assistant" as const, text: turn.reply }] : []),
      ]);
      const next = [...history, { role: "user" as const, text: q }];
      setDraftTurns((items) => [...items, { q }]);
      setDraftBusy(true);
      const prepared: Draft["draft"] = {
        title: buyer.title, scope: `Annual supply of corrugated packaging for ${buyer.plant}`,
        lines: lines.map((line) => ({ id: line.id, description: line.description, style: line.style, inner_dims_mm: dimsLabel(line), ply: line.ply, bf: line.bf, gsm_layers: line.gsmLayers.join("/"), print_colours: line.printColours, annual_qty: line.annualQty, unit: "per piece" })),
        questionnaire: questions.map((question) => ({ question: question.text, must_have: question.mustHave, pass_rule: question.passRule ?? "" })),
        terms, open_questions: [],
      };
      try {
        const result = await api<Draft>("/api/draft", { messages: next, current: workingDraft ?? prepared });
        setWorkingDraft(result.draft);
        setDraftTurns((items) => items.map((item, index) => index === items.length - 1 ? { ...item, reply: result.reply } : item));
      } catch (error) {
        setDraftTurns((items) => items.map((item, index) => index === items.length - 1 ? { ...item, error: (error as Error).message } : item));
      } finally { setBusy(false); setDraftBusy(false); }
      return;
    }
    const history = turns.filter((t) => t.a).flatMap((t) => [{ role: "user" as const, text: t.q }, { role: "assistant" as const, text: t.a!.answer }]);
    setTurns((ts) => [...ts, { q }]);
    try {
      const a = await api<AnalystAnswer>("/api/ask", { question: q, history, overrides, run });
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, a } : t)));
    } catch (e) {
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, error: (e as Error).message } : t)));
    } finally {
      setBusy(false);
    }
  };

  // A question typed in the header Ask bar lands here and is sent once.
  const handled = useRef<string | null>(null); // guards against effects running twice (React dev mode)
  useEffect(() => {
    if (pendingQuestion && pendingQuestion !== handled.current) {
      handled.current = pendingQuestion;
      takePendingQuestion();
      send(pendingQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  return (
    <div className={compact ? "copilot-content" : "mx-auto max-w-4xl"}>
      <div className={compact ? "copilot-scroll" : ""}>
        {/* One thread for the whole RFx: the drafting conversation stays above the analysis. */}
        <p className="copilot-intro">Tell me what you need. I&apos;ll shape the brief and show what still needs an answer.</p>
        {drafting && draftTurns.length === 0 && <Prompts items={DRAFT_SUGGESTED} send={send} compact={compact} />}
        <div className="space-y-5">
          {draftTurns.map((turn, index) => <div key={index}><div className="chat-user">{turn.q}</div>{!turn.reply && !turn.error && <div className="animate-pulse text-sm text-[var(--bitter-500)]">Shaping the brief…</div>}{turn.error && <div className="rounded-lg border border-[var(--punch-200)] bg-[var(--punch-50)] p-3 text-sm text-[var(--punch-800)]">{turn.error}</div>}{turn.reply && <div className="answer-card"><span className="answer-kicker">Aera</span><p className="answer-lead">{turn.reply}</p><p className="mt-2 text-xs text-[var(--bitter-500)]">The brief on the left has been updated.</p></div>}</div>)}
        </div>
        {!drafting && <>
          {draftApprovalAt && <div className="chat-divider"><span>RFx sent to {vendorIds.length} suppliers</span></div>}
          {stage === "workspace" && <div className="answer-card"><span className="answer-kicker">Aera</span><p className="answer-lead">All {vendorIds.length} replies are in. I&apos;ve read every file, lined up {lines.length} items on one basis (₹ per piece, delivered, ex-GST) and marked what I&apos;m not sure about. Ask me anything about the comparison.</p></div>}
          {stage === "replies" && <div className="answer-card"><span className="answer-kicker">Aera</span><p className="answer-lead">Replies are coming in. I read each one as it arrives.</p></div>}
          {stage === "workspace" && turns.length === 0 && <Prompts items={compact ? [SUGGESTED[0], SUGGESTED[1], SUGGESTED[2]] : SUGGESTED} send={send} compact={compact} />}
          <div className="mt-4 space-y-5">
            {turns.map((t, i) => (
              <div key={i}>
                <div className="chat-user">{t.q}</div>
                {!t.a && !t.error && <div className="animate-pulse text-sm text-[var(--bitter-500)]">Looking into it: querying the comparison, running scenarios…</div>}
                {t.error && <div className="rounded-lg border border-[var(--punch-200)] bg-[var(--punch-50)] p-3 text-sm text-[var(--punch-800)]">{t.error}</div>}
                {t.a && <AnswerCard a={t.a} />}
              </div>
            ))}
          </div>
        </>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className={compact ? "copilot-composer" : "sticky bottom-0 mt-5 flex gap-2 bg-white py-3"}>
        <label htmlFor={compact ? "copilot-input" : "analyst-input"} className="sr-only">{drafting ? "Describe the RFx to Aera" : "Ask the RFx copilot"}</label>
        <input id={compact ? "copilot-input" : "analyst-input"} value={input} onChange={(e) => setInput(e.target.value)} placeholder={drafting ? "Describe what you need to source…" : stage === "replies" ? "Ask once the replies are in…" : "Ask about prices, suppliers or award options…"} className="min-w-0 flex-1 rounded-xl border border-[var(--bitter-300)] bg-white px-3 py-2 text-sm outline-none focus:border-[#871ad6]" />
        <button disabled={busy || !input.trim() || stage === "replies"} className="rounded-xl bg-[#871ad6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Thinking…" : "Ask"}</button>
      </form>
    </div>
  );
}

function Prompts({ items, send, compact }: { items: string[]; send: (q: string) => void; compact: boolean }) {
  return <div className={compact ? "copilot-prompts" : "mb-4 flex flex-wrap gap-2"}>{items.map((s) => <button key={s} onClick={() => send(s)} className="copilot-prompt">{s}</button>)}</div>;
}

export function AnswerCard({ a }: { a: AnalystAnswer }) {
  const g = a.numberGuard;
  return (
    <div className="answer-card">
      <span className="answer-kicker">Aera</span>
      <Markdownish text={a.answer} />
      {a.artifacts.map((art, i) => <ArtifactView key={i} art={art} />)}
      <div className="answer-foot">
        <span className={g.unverified.length ? "text-[var(--international-orange-700)]" : "text-[var(--malachite-700)]"} title="Every number in the answer is checked against the computed tool results. It can't prove a number is attached to the right supplier or line, so the tables are the authoritative figures.">
          {g.unverified.length ? `⚠ ${g.unverified.length} of ${g.checked} numbers not found in a tool result: ${g.unverified.join(", ")}` : `✓ All ${g.checked} numbers come from computed results`}
        </span>
        <details>
          <summary>How this was worked out ({a.trace.length} steps)</summary>
          <ol>{a.trace.map((step, i) => <li key={i}><b>{step.tool}</b> <span>{step.summary}</span></li>)}</ol>
        </details>
      </div>
    </div>
  );
}

/** Minimal rendering for the analyst's prose: paragraphs, bullets, tables, **bold**. */
function Markdownish({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  return (
    <div className="answer-body">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
          const rows = lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
          return <div key={i} className="answer-table"><table><thead><tr>{rows[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead><tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>;
        }
        if (lines.every((l) => /^\s*([-*•]|\d+\.) /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.) /, ""))}</li>)}</ul>;
        if (/^#{1,4} /.test(b)) return <p key={i} className="font-semibold">{inline(b.replace(/^#{1,4} /, ""))}</p>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}

function ArtifactView({ art }: { art: Artifact }) {
  if (art.kind === "chart" && art.chart) {
    return <div className="mt-3"><div className="mb-1 text-sm font-medium">{art.title}</div><Chart chart={art.chart} /></div>;
  }
  const exportXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet([art.columns ?? [], ...(art.rows ?? [])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Answer");
    XLSX.writeFile(wb, `${art.title.replace(/[^\w]+/g, "_").slice(0, 60)}.xlsx`);
  };
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{art.title}</div>
        <button onClick={exportXlsx} className="rounded border border-[var(--bitter-300)] px-2 py-0.5 text-xs hover:bg-[var(--bitter-50)]">Export to Excel</button>
      </div>
      <div className="overflow-x-auto rounded border border-[var(--bitter-200)]">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bitter-100)] text-left"><tr>{art.columns?.map((c, i) => <th key={i} className="px-2 py-1 font-medium">{c}</th>)}</tr></thead>
          <tbody>{art.rows?.map((r, i) => <tr key={i} className="border-t border-[var(--bitter-100)]">{r.map((x, j) => <td key={j} className="num px-2 py-1">{x}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
