"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useWS } from "../WorkspaceContext";
import { api } from "@/lib/client-api";
import type { RunData } from "@/lib/state";

const ACCEPT = ".xlsx,.xls,.csv,.pdf,.docx,.jpg,.jpeg,.png,.txt,.eml";
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4_000_000;

export function UploadReply() {
  const { run, setRun, vendorIds, vendorName, registerUploadedReply, markLive, uploadOpen, setUploadOpen } = useWS();
  const [vendorId, setVendorId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const nextId = String.fromCharCode(65 + vendorIds.length);
  const selected = vendorId;

  const readReply = async () => {
    if (!files.length || !selected || busy) return;
    const bad = files.find((file) => file.size > MAX_BYTES || !/\.(xlsx|xls|csv|pdf|docx|jpe?g|png|txt|eml)$/i.test(file.name));
    if (bad) { setMessage(`${bad.name} must use a supported format and be under 4 MB.`); return; }
    const runJson = JSON.stringify(run);
    const requestBytes = new Blob([runJson]).size + files.reduce((sum, file) => sum + file.size, 0) + 64_000;
    if (requestBytes > MAX_REQUEST_BYTES) { setMessage("This reply is too large. Keep all files and the existing request data under 4 MB combined."); return; }
    setBusy(true); setMessage("");
    try {
      const form = new FormData();
      form.set("vendorId", selected);
      form.set("run", runJson);
      for (const file of files) form.append("files", file);
      const result = await api<{ run: RunData; seconds: number; secondRead: boolean }>("/api/extract", form);
      registerUploadedReply(selected, files);
      setRun(result.run);
      markLive(selected);
      setUploadOpen(false);
      setVendorId("");
      setMessage("");
      setFiles([]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setBusy(false); }
  };

  return <>
    <button className="upload-reply-trigger" aria-label="Add a reply" title="Add a reply" onClick={() => { setFiles([]); setVendorId(""); setMessage(""); setUploadOpen(true); }}>+</button>
    {uploadOpen && createPortal(<div className="upload-reply-backdrop" onClick={() => { if (!busy) setUploadOpen(false); }}>
      <section className="upload-reply-modal" role="dialog" aria-modal="true" aria-labelledby="upload-reply-title" onClick={(event) => event.stopPropagation()}>
        <div className="upload-reply-head"><div><h2 id="upload-reply-title">Add a supplier reply</h2><p>Aera will read the files against this request&apos;s 30 packaging items.</p></div></div>
        <label>Supplier<select value={vendorId} onChange={(event) => setVendorId(event.target.value)} disabled={busy}><option value="">Select supplier</option>{vendorIds.map((id) => <option key={id} value={id}>{vendorName(id)} · {run.vendors[id] ? "replace reply" : "awaiting reply"}</option>)}<option value={nextId}>Another supplier · {nextId}</option></select></label>
        <label>Reply files<input type="file" multiple accept={ACCEPT} disabled={busy} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
        <p className="upload-reply-help">Excel, CSV, PDF, Word, photo, text or email. All files and request data must fit within 4 MB combined. Uploads stay in this browser session. Replacements record the prior file names and time.</p>
        {(busy || message) && <p className="upload-reply-message" role="status">{busy ? "Analyzing supplier reply…" : message}</p>}
        <div className="draft-edit-actions"><button disabled={busy} onClick={() => setUploadOpen(false)}>Cancel</button><button className="primary-action" disabled={busy || !selected || !files.length} onClick={readReply}>{busy ? "Analyzing…" : "Save"}</button></div>
      </section>
    </div>, document.body)}
  </>;
}
