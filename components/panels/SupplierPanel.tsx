"use client";
// One supplier, everything in one place: the reply exactly as it came in, what Aera read from it,
// how it did on the quality questionnaire, and the terms only the buyer can accept.
import { useEffect, useState } from "react";
import { useWS } from "../WorkspaceContext";
import { TermCard } from "../tabs/ReviewTab";
import { api } from "@/lib/client-api";
import { inr } from "@/lib/format";
import { isFlagged } from "@/lib/insights";
import { RECEIVED, REPLY_SHAPE, fileKind } from "../stages/replies-meta";
import type { RunData } from "@/lib/state";

export function SupplierPanel({ vendorId }: { vendorId: string }) {
  const { run, setRun, vendorName, cells, lines, questions, openSource, termDecisions, saveTermDecision, buyer, askFromAnywhere, liveReads, markLive, storedRunAt, fileUrl } = useWS();
  const files = run.vendors[vendorId]?.files ?? [];
  // The pricing document first (photo, PDF, sheet); a covering email last.
  const rank = (f: string) => /\.(jpe?g|png)$/i.test(f) ? 0 : /\.(txt|eml)$/i.test(f) ? 2 : 1;
  const primary = files.filter((f) => !/attachment/i.test(f)).sort((a, b) => rank(a) - rank(b));
  const [fileIdx, setFileIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const q = run.questionnaire.find((x) => x.vendorId === vendorId);
  const t = run.terms.find((x) => x.vendorId === vendorId);
  const vc = cells.filter((c) => c.vendorId === vendorId);
  const flagged = vc.filter(isFlagged);

  const reread = async () => {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set("vendorId", vendorId);
      fd.set("run", JSON.stringify(run));
      const r = await api<{ run: RunData; seconds: number; costUsd: number; secondRead: boolean }>("/api/extract", fd);
      setRun(r.run); markLive(vendorId);
      setMsg(`Read again live in ${r.seconds}s ($${r.costUsd.toFixed(2)})${r.secondRead ? ", with an independent second read" : ""}. The table and award have updated.`);
    } catch (e) { setMsg(`Couldn't read: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return <div className="supplier-panel">
    <p className="sp-meta">Replied {RECEIVED[vendorId] ?? "live"} · {REPLY_SHAPE[vendorId] ?? fileKind(files).join(", ")}</p>

    <section className="sp-section">
      <div className="sp-section-head"><h3>The reply, as it came in</h3><div className="seg">{primary.map((f, i) => <button key={f} aria-pressed={fileIdx === i} onClick={() => setFileIdx(i)}>{fileKind([f])[0]}</button>)}</div></div>
      {primary[fileIdx] && <OriginalFile file={primary[fileIdx]} url={fileUrl(primary[fileIdx])} />}
      {files.filter((f) => /attachment/i.test(f)).map((f) => <a key={f} className="sp-attachment" href={fileUrl(f)} target="_blank" rel="noreferrer">Attachment: {f.replace(/^[A-Z]_attachment_/, "").replace(/_/g, " ")} ↗</a>)}
    </section>

    <section className="sp-section">
      <div className="sp-section-head"><h3>What Aera read</h3><span>{vc.filter((c) => c.inrPerPiece != null).length} of {lines.length} items priced · {flagged.length} need a second look</span></div>
      <div className="sp-read">
        <table><thead><tr><th>Item</th><th>As they wrote it</th><th className="num">₹ / piece</th><th /></tr></thead>
          <tbody>{vc.map((c) => {
            const l = lines.find((x) => x.id === c.lineId)!;
            return <tr key={c.lineId} className={isFlagged(c) ? "row-flag" : c.status === "missing" ? "row-missing" : ""}>
              <td><strong>{l.description}</strong><small>{l.id}</small></td>
              <td className="mono">{c.source.asWritten || c.source.quote || "—"}</td>
              <td className="num">{c.inrPerPiece != null ? inr(c.inrPerPiece) : "not quoted"}</td>
              <td><button onClick={() => openSource(vendorId, c.lineId)}>{isFlagged(c) ? "Check" : "Source"}</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="sp-provenance">
        <span>{liveReads[vendorId] ? `Read live in this session at ${new Date(liveReads[vendorId]).toLocaleTimeString("en-IN")}` : `Stored run: read by the real models on ${new Date(storedRunAt).toLocaleString("en-IN")}`}</span>
        {!files.some((file) => fileUrl(file).startsWith("blob:")) && <button disabled={busy} onClick={reread}>{busy ? "Reading… (photos take up to 2 min)" : "Read it again live"}</button>}
      </div>
      {msg && <p className="sp-msg">{msg}</p>}
    </section>

    <section className="sp-section">
      <div className="sp-section-head"><h3>Quality questionnaire</h3><span className={`q-pill q-${q?.clears}`}>{q?.clears === "yes" ? "Cleared" : q?.clears === "no" ? "Did not clear" : "Not answered"}</span></div>
      <ul className="sp-verdicts">{questions.filter((x) => x.mustHave).map((x) => {
        const v = q?.verdicts.find((y) => y.question_id === x.id);
        return <li key={x.id} className={`v-${v?.verdict ?? "not_answered"}`}><span>{v?.verdict === "pass" ? "✓" : v?.verdict === "fail" ? "✗" : "?"}</span><div><strong>{x.text}</strong><small>{v?.reason ?? "No answer in the reply"}{v?.evidence_quote ? ` · “${v.evidence_quote}”` : ""}</small></div></li>;
      })}</ul>
    </section>

    {!!t?.flags.length && <section className="sp-section">
      <div className="sp-section-head"><h3>Terms to decide</h3></div>
      <TermCard vendorId={vendorId} name={vendorName(vendorId)} flags={t.flags} decision={termDecisions[vendorId]} save={saveTermDecision} buyerId={buyer.rfxId} ask={askFromAnywhere} copied={copied === vendorId} setCopied={setCopied} />
    </section>}
  </div>;
}

/** Shows the original file inline where the browser can; otherwise offers it to open. */
function OriginalFile({ file, url }: { file: string; url: string }) {
  const ext = file.split(".").pop()?.toLowerCase();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (ext !== "txt" && ext !== "eml") return;
    let live = true;
    fetch(url).then((r) => r.text()).then((x) => { if (live) setText(x); }).catch(() => {});
    return () => { live = false; };
  }, [url, ext]);
  if (ext === "jpg" || ext === "jpeg" || ext === "png") {
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="The supplier's photo of their rate card" className="sp-image" /></a>;
  }
  if (ext === "pdf") return <iframe src={url} title={file} className="sp-frame" />;
  if (ext === "txt" || ext === "eml") return <pre className="sp-email">{text ?? "Loading…"}</pre>;
  return <div className="sp-download"><strong>{file}</strong><p>{ext === "xlsx" ? "An Excel workbook in the supplier's own layout." : "A Word document."} Browsers can&apos;t show it inline; open it in {ext === "xlsx" ? "Excel" : "Word"} to compare with what Aera read below.</p><a href={url} download>Download the original ↓</a></div>;
}
