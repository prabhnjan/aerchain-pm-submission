"use client";
// After sending: replies arrive one by one, each in its own messy format. Aera reads each as it lands.
import { useWS } from "../WorkspaceContext";
import { fileKind, RECEIVED, REPLY_SHAPE } from "./replies-meta";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function RepliesStage() {
  const { vendorIds, vendorName, cells, lines, buyer, openPanel, run, repliesIn: arrived } = useWS();
  const all = arrived >= vendorIds.length;

  return <div className="replies-stage">
    <div className="win-intro">
      <span className="eyebrow">{buyer.rfxId} · sent to {vendorIds.length} suppliers · replies due {day(buyer.replyBy)}</span>
      <h2>{all ? `All ${vendorIds.length} suppliers have replied` : `Responses received from ${arrived} of ${vendorIds.length} suppliers`}</h2>
      <p>Open any reply to see the original exactly as it came in, next to what Aera read from it.</p>
    </div>
    <ol className="reply-list">
      {vendorIds.map((v, i) => {
        const here = i < arrived;
        const priced = cells.filter((c) => c.vendorId === v && c.inrPerPiece != null).length;
        return <li key={v} className={here ? "reply-row reply-in" : "reply-row reply-waiting"}>
          {here ? <button onClick={() => openPanel({ kind: "supplier", vendorId: v })}>
            <span className="reply-when">{RECEIVED[v] ?? "Uploaded"}</span>
            <span className="reply-who"><strong>{vendorName(v)}</strong><small>{REPLY_SHAPE[v] ?? "Reply"}</small></span>
            <span className="reply-files">{fileKind(run.vendors[v]?.files ?? []).map((k) => <span key={k} className="file-chip">{k}</span>)}</span>
            <span className="reply-read"><span className="read-dot" />Read · {priced} of {lines.length} items priced</span>
            <span className="reply-open">Open reply →</span>
          </button> : <div className="reply-pending"><span className="reply-when">Waiting</span><span className="reply-who"><strong>{vendorName(v)}</strong><small>Invited · no reply yet</small></span></div>}
        </li>;
      })}
    </ol>
    {all && <div className="replies-next"><button className="primary-action" onClick={() => openPanel({ kind: "compare" })}>Open the comparison →</button></div>}
  </div>;
}
