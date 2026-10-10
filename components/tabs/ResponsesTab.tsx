"use client";
// The inbox: what was sent (stubbed email), what came back, how it was read, and live re-reads.
import { useState } from "react";
import { useWS } from "../WorkspaceContext";
import { api } from "@/lib/client-api";
import type { RunData } from "@/lib/state";

const RECEIVED: Record<string, string> = { A: "24 Sep · day 3", B: "26 Sep · day 5", C: "27 Sep · day 6", D: "29 Sep · day 8", E: "30 Sep · day 9" };

export function ResponsesTab() {
  const { run, setRun, vendorIds, vendorName, cells, buyer, terms, lines, liveReads, markLive, storedRunAt, draftApprovalAt, responseFocus, showAllResponses } = useWS();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newId, setNewId] = useState("F");
  const [files, setFiles] = useState<FileList | null>(null);

  const reread = async (vendorId: string, upload?: FileList | null) => {
    setBusy(vendorId);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("vendorId", vendorId);
      fd.set("run", JSON.stringify(run));
      if (upload) for (const f of Array.from(upload)) fd.append("files", f);
      const r = await api<{ run: RunData; seconds: number; costUsd: number; secondRead: boolean }>("/api/extract", fd);
      setRun(r.run);
      markLive(vendorId);
      setMsg(`Read ${vendorName(vendorId)} live in ${r.seconds}s ($${r.costUsd.toFixed(2)})${r.secondRead ? ", with an independent second read" : ""}. Grid, review and award updated.`);
    } catch (e) {
      setMsg(`Couldn't read: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <details id="sent-rfx" className="sent-rfx-card glass-card p-4">
        <summary className="cursor-pointer text-sm"><span className="eyebrow">SIMULATED DISPATCH · 21 SEP</span><span className="mt-1 block text-lg font-semibold">RFx to five vendors</span><span className="mt-1 block text-xs text-[var(--bitter-600)]">{buyer.rfxId} · {lines.length} lines · 10-question quality questionnaire · reply by {buyer.replyBy}</span>{draftApprovalAt && <span className="mt-2 block text-xs text-[#871ad6]">Your approved Aera draft matches this published RFx.</span>}</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-[var(--bitter-50)] p-3 font-mono text-xs">{`Subject: ${buyer.rfxId}: ${buyer.title}\n\nDear supplier,\n\nPlease quote for the ${lines.length} corrugated packaging items in the attached sheet, and answer the attached quality questionnaire.\n\n${terms.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nAttachments: ${buyer.rfxId}_lines.xlsx, quality_questionnaire.pdf\n\nRegards,\nCategory Buyer, Packaging, ${buyer.company}`}</pre>
      </details>

      {msg && <div className="rounded-lg border border-[var(--bitter-300)] bg-white p-3 text-sm">{msg}</div>}

      <div id="replies-intake" className="flex flex-wrap items-end justify-between gap-2">
        <div><span className="eyebrow">SUPPLIER INBOX</span><h2 className="mt-1 text-xl font-semibold tracking-tight">{responseFocus ? vendorName(responseFocus) : "From each supplier"}</h2><p className="text-sm text-[var(--bitter-600)]">Original files and what Aera read from them</p></div>
        {responseFocus ? <button onClick={showAllResponses} className="rounded-full border border-[#ead3ff] px-3 py-1.5 text-xs font-semibold text-[#871ad6]">← See all five replies</button> : <span className="rounded-full bg-[#fff7ed] px-3 py-1.5 text-xs font-semibold text-[#871ad6]">{vendorIds.length} replies received</span>}
      </div>
      <div className={responseFocus ? "grid gap-3 response-focus" : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {vendorIds.filter((id) => !responseFocus || id === responseFocus).map((v) => {
          const cs = cells.filter((c) => c.vendorId === v);
          const read = cs.filter((c) => c.inrPerPiece != null).length;
          const review = cs.filter((c) => c.status === "needs_review" || c.status === "carried").length;
          const q = run.questionnaire.find((x) => x.vendorId === v);
          const t = run.terms.find((x) => x.vendorId === v);
          const calls = run.aiCalls.filter((c) => c.purpose.endsWith(`:${v}`));
          return (
            <div key={v} className="glass-card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{vendorName(v)}</div>
                  <div className="text-xs text-[var(--bitter-500)]">Received {RECEIVED[v] ?? "uploaded live"}</div>
                </div>
                <button disabled={!!busy} onClick={() => reread(v)} className="rounded-md border border-[var(--bitter-300)] px-2 py-1 text-xs hover:bg-[var(--bitter-50)] disabled:opacity-40">{busy === v ? "Reading…" : "Re-read live"}</button>
              </div>
              <div className="mt-2 space-y-0.5 text-xs">
                {run.vendors[v]?.files.map((f) => <div key={f}><a className="underline decoration-stone-300" href={`/replies/${f}`} target="_blank" rel="noreferrer">{f}</a></div>)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat n={read} label={`of ${lines.length} lines priced`} />
                <Stat n={review} label="to check" tone={review ? "amber" : undefined} />
                <Stat n={q?.clears === "yes" ? "✓" : q?.clears === "no" ? "✗" : "–"} label="quality" tone={q?.clears === "yes" ? "green" : q?.clears === "no" ? "red" : undefined} />
              </div>
              {run.vendors[v]?.superseded?.map((x, i) => (
                <div key={i} className="mt-2 rounded bg-[var(--amethyst-50)] px-2 py-1 text-xs text-[var(--amethyst-900)]">
                  Supersedes an earlier reply ({x.files.join(", ")}, {x.pricedLines} lines priced), replaced {new Date(x.replacedAt).toLocaleTimeString("en-IN")}. The comparison uses the latest reply only.
                </div>
              ))}
              {t?.flags.length ? <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-[var(--bitter-700)]">{t.flags.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
              <details className={`mt-3 rounded px-2 py-1 text-xs ${liveReads[v] ? "bg-[var(--malachite-50)] text-[var(--malachite-800)]" : "bg-[var(--bitter-50)] text-[var(--bitter-500)]"}`}><summary className="cursor-pointer font-medium">How Aera read this reply</summary><div className="mt-2">{liveReads[v] ? `Read live in this session at ${new Date(liveReads[v]).toLocaleTimeString("en-IN")}` : `Stored run: read by the real models on ${new Date(storedRunAt).toLocaleString("en-IN")}, not re-read in this session`}</div><div className="text-[var(--bitter-400)]">{calls.length ? calls.map((c) => `${c.purpose.split(":")[0]} · ${c.model} · ${(c.ms / 1000).toFixed(0)}s`).join(" | ") : ""}</div></details>
            </div>
          );
        })}
        {!responseFocus && <div className="glass-card p-4 text-sm">
          <div className="font-semibold">Read a new reply</div>
          <p className="mt-1 text-xs text-[var(--bitter-600)]">Upload any vendor&apos;s reply (Excel, PDF, Word, photo, or a .txt of an email). It&apos;s read live with the same checks. Use an existing vendor&apos;s letter to send a revised reply: it supersedes the earlier one, which stays on record.</p>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs">Vendor id <input value={newId} onChange={(e) => setNewId(e.target.value.toUpperCase().slice(0, 3))} className="ml-1 w-12 rounded border border-[var(--bitter-300)] px-1 py-0.5" /></label>
            <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,.jpg,.jpeg,.png,.txt,.eml" onChange={(e) => setFiles(e.target.files)} className="text-xs" />
          </div>
          <button disabled={!files?.length || !!busy} onClick={() => reread(newId, files)} className="mt-2 rounded-md bg-[var(--bitter-900)] px-3 py-1.5 text-xs text-white disabled:opacity-40">{busy === newId ? "Reading… (up to 2 min for photos)" : "Read it"}</button>
        </div>}
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: "amber" | "green" | "red" }) {
  const c = tone === "amber" ? "text-[var(--international-orange-700)]" : tone === "green" ? "text-[var(--malachite-700)]" : tone === "red" ? "text-[var(--punch-700)]" : "text-[var(--bitter-900)]";
  return <div className="rounded bg-[var(--bitter-50)] py-1.5"><div className={`num text-lg font-semibold ${c}`}>{n}</div><div className="text-[11px] text-[var(--bitter-500)]">{label}</div></div>;
}
