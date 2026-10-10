"use client";
// Opens from any number: shows the value next to its evidence, every check, and lets the buyer act.
import { useState } from "react";
import { useWS } from "./WorkspaceContext";
import { inr, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import { dimsLabel, pieceWeightGrams } from "@/lib/domain/spec";

export function SourceDrawer() {
  const { source, closeSource, cells, lines, vendorName, run, addOverride, fileUrl } = useWS();
  const [mode, setMode] = useState<"none" | "confirm" | "correct" | "ask">("none");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  if (!source) return null;
  const c = cells.find((x) => x.vendorId === source.vendorId && x.lineId === source.lineId);
  const l = lines.find((x) => x.id === source.lineId);
  if (!c || !l) return null;
  const files = run.vendors[c.vendorId]?.files ?? [];
  const image = files.find((f) => /\.(jpe?g|png)$/i.test(f));
  const close = () => { setMode("none"); setValue(""); setNote(""); closeSource(); };
  const now = () => new Date().toISOString();

  const clarification = `Dear ${vendorName(c.vendorId)},\n\nThank you for your quotation against our RFQ. Before we finalise, please confirm one item:\n\nLine ${l.id} (${l.description}, ${dimsLabel(l)} mm, ${l.ply}-ply):\nWe read your price as "${c.source.asWritten || c.source.quote || "not quoted"}"${c.inrPerPiece != null ? `, which works out to ${inr(c.inrPerPiece)} per piece ex-GST` : ""}.\n${c.reasons.length ? `We'd like to confirm because: ${c.reasons[0]}.\n` : ""}\nPlease reply with the correct price per piece (ex-GST, delivered to Hosur), or confirm the above.\n\nRegards,\nCategory Buyer, Packaging`;

  return (
    <div className="source-backdrop fixed inset-0 z-[70] flex justify-end backdrop-blur-[8px]" onClick={close} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`Source evidence for ${l.id}`} className="source-drawer h-full w-full max-w-xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="source-drawer-header flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--bitter-500)]">{vendorName(c.vendorId)} · {l.id}</div>
            <h2 className="text-base font-semibold">{l.description}</h2>
            <div className="text-xs text-[var(--bitter-500)]">{dimsLabel(l)} mm · {l.ply}-ply {l.flutes} · {l.bf} BF · GSM {l.gsmLayers.join("/")} · {Math.round(pieceWeightGrams(l))} g · {l.annualQty.toLocaleString("en-IN")}/yr</div>
          </div>
          <button autoFocus onClick={close} className="rounded-xl border border-[#ead3ff] bg-white px-3 py-1.5 text-[#871ad6] hover:bg-[#faf5ff]" aria-label="Close source evidence">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-[var(--bitter-200)] p-3">
            <div className="text-xs text-[var(--bitter-500)]">Price per piece (ex-GST)</div>
            <div className="num text-xl font-semibold">{inr(c.inrPerPiece)}</div>
            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          </div>
          <div className="rounded-lg border border-[var(--bitter-200)] p-3">
            <div className="text-xs text-[var(--bitter-500)]">Landed (+ freight, tooling)</div>
            <div className="num text-xl font-semibold">{c.landedRange ? `${inr(c.landedRange[0])}–${inr(c.landedRange[1]).slice(1)}` : inr(c.landedPerPiece)}</div>
            {c.landedRange && <div className="text-xs text-[var(--bitter-500)]">Freight amount unknown: range uses your lane estimate</div>}
          </div>
        </div>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--bitter-500)]">As the vendor wrote it</h3>
          <blockquote className="mt-1 rounded-md border-l-4 border-[var(--bitter-300)] bg-[var(--bitter-50)] px-3 py-2 font-mono text-sm">{c.source.quote || c.source.asWritten || "(no price in the reply)"}</blockquote>
          <div className="mt-1 text-xs text-[var(--bitter-500)]">Where: {c.source.ref || "—"} · Files: {files.map((f) => <a key={f} href={fileUrl(f)} target="_blank" className="mr-2 underline" rel="noreferrer">{f}</a>)}</div>
          {image && (
            <a href={fileUrl(image)} target="_blank" rel="noreferrer" className="relative mt-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(image)} alt="Vendor's photo of the rate card" className="w-full rounded border border-[var(--bitter-200)]" />
              {c.source.pixelBox && (
                <span
                  className="pointer-events-none absolute border-2 border-[var(--malachite-600)]"
                  style={{ left: `${c.source.pixelBox[0] * 100}%`, top: `${c.source.pixelBox[1] * 100}%`, width: `${(c.source.pixelBox[2] - c.source.pixelBox[0]) * 100}%`, height: `${(c.source.pixelBox[3] - c.source.pixelBox[1]) * 100}%` }}
                />
              )}
              {c.source.photoBand && (
                <span
                  className="pointer-events-none absolute left-0 right-0 border-y-2 border-[var(--international-orange-500)] bg-[var(--international-orange-300)]/25"
                  style={{ top: `${c.source.photoBand[0] * 100}%`, height: `${(c.source.photoBand[1] - c.source.photoBand[0]) * 100}%` }}
                />
              )}
            </a>
          )}
          {image && c.source.photoBand && (
            <>
              <div className="mt-2 text-xs font-medium text-[var(--bitter-600)]">Enlarged: that row of the photo</div>
              <div
                className="mt-1 h-24 w-full rounded border-2 border-[var(--international-orange-500)] bg-no-repeat"
                style={{
                  backgroundImage: `url(${fileUrl(image)})`,
                  backgroundSize: "260% auto",
                  backgroundPosition: `55% ${((c.source.photoBand[0] + c.source.photoBand[1]) / 2) * 100}%`,
                }}
                role="img"
                aria-label="Enlarged crop of the row this price was read from"
              />
              <div className="mt-1 text-xs text-[var(--bitter-500)]">Highlighted and enlarged: the row the reader says it read this price from (approximate position reported by the model; check the digits here).</div>
            </>
          )}
        </section>

        {c.conversion.length > 0 && (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--bitter-500)]">How it was converted</h3>
            <ol className="mt-1 list-decimal pl-5 text-sm">{c.conversion.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
        )}

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--bitter-500)]">Checks</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {c.checks.length === 0 && c.status === "missing" && <li className="text-[var(--bitter-500)]">Not quoted: excluded from totals for this vendor, never counted as zero.</li>}
            {c.checks.map((k, i) => (
              <li key={i} className="flex gap-2">
                <span className={k.ok ? "text-[var(--malachite-600)]" : "text-[var(--international-orange-600)]"}>{k.ok ? "✓" : "⚠"}</span>
                <span><b className="font-medium">{CHECK_NAME[k.id] ?? k.id}</b>{k.ok ? " passed" : `: ${k.reason}`}</span>
              </li>
            ))}
          </ul>
        </section>

        {c.override && (
          <div className="mt-4 rounded-md bg-[var(--bitter-100)] p-3 text-sm">
            {c.override.action === "confirm" ? "Confirmed" : `Corrected from ${inr(c.override.previous)} to ${inr(c.override.value)}`} by {c.override.by}, {new Date(c.override.at).toLocaleString("en-IN")}. {c.override.note && `“${c.override.note}”`}
          </div>
        )}

        {c.inrPerPiece != null || c.status === "missing" ? (
          <section className="mt-5 border-t border-[var(--bitter-200)] pt-4">
            <div className="flex flex-wrap gap-2">
              {c.inrPerPiece != null && (
                <button className="rounded-md bg-[#871ad6] px-3 py-1.5 text-sm text-white hover:bg-[#5e178c]" onClick={() => setMode(mode === "confirm" ? "none" : "confirm")}>
                  Confirm value
                </button>
              )}
              <button className="rounded-md border border-[var(--bitter-300)] px-3 py-1.5 text-sm hover:bg-[var(--bitter-50)]" onClick={() => setMode(mode === "correct" ? "none" : "correct")}>Correct value</button>
              <button className="rounded-md border border-[var(--bitter-300)] px-3 py-1.5 text-sm hover:bg-[var(--bitter-50)]" onClick={() => setMode(mode === "ask" ? "none" : "ask")}>Ask vendor to confirm</button>
            </div>
            {mode === "confirm" && (
              <div className="mt-3 rounded-xl border border-[#ffba71] bg-[#fff7ed] p-3 text-sm">
                <p className="font-semibold text-[#7f2c0f]">Confirm what you saw in the original reply.</p>
                <p className="mt-1 text-xs text-[#7f2c0f]">{c.checks.some((check) => !check.ok) ? "This value has failed checks. Confirm it only if the source supports the price and unit shown above." : "Your note becomes part of the audit trail."}</p>
                <label htmlFor="confirm-note" className="mt-3 block text-xs font-medium">What did you verify?</label>
                <input id="confirm-note" className="mt-1 w-full rounded-md border border-[#d7d9ce] bg-white px-3 py-2 text-sm" placeholder="e.g. Checked the original sheet and confirmed the unit" value={note} onChange={(e) => setNote(e.target.value)} />
                <button disabled={!note.trim()} className="mt-3 rounded-md bg-[#871ad6] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => { addOverride({ vendorId: c.vendorId, lineId: c.lineId, action: "confirm", note: note.trim(), at: now() }); close(); }}>Save confirmation</button>
              </div>
            )}
            {mode === "correct" && (
              <div className="mt-3 space-y-2">
                <input className="w-40 rounded border border-[var(--bitter-300)] px-2 py-1 text-sm" placeholder="₹ per piece" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
                <input className="w-full rounded border border-[var(--bitter-300)] px-2 py-1 text-sm" placeholder="Reason (required, goes in the audit trail)" value={note} onChange={(e) => setNote(e.target.value)} />
                <button
                  disabled={!value || !note || isNaN(parseFloat(value))}
                  className="rounded-md bg-[var(--bitter-900)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
                  onClick={() => { addOverride({ vendorId: c.vendorId, lineId: c.lineId, action: "correct", value: parseFloat(value), note, at: now() }); close(); }}
                >
                  Save correction
                </button>
              </div>
            )}
            {mode === "ask" && (
              <div className="mt-3">
                <textarea readOnly className="h-56 w-full rounded border border-[var(--bitter-300)] p-2 font-mono text-xs" value={clarification} />
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--bitter-500)]">
                  <button className="rounded border border-[var(--bitter-300)] px-2 py-1 text-[var(--bitter-800)]" onClick={() => navigator.clipboard?.writeText(clarification)}>Copy</button>
                  Sending is stubbed in this prototype: copy it into your email.
                </div>
              </div>
            )}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

const CHECK_NAME: Record<string, string> = {
  grounded: "Quote found in the reply",
  cell_address: "Spreadsheet cell matches",
  second_read: "Independent second read",
  magnitude: "Plausible price",
  unit_basis: "Unit",
  history_drift: "Vs last year",
  spec_deviation: "Spec",
  scope: "Which lines this rate covers",
  legibility: "Legibility",
  carried: "Carried from last year",
  currency: "Currency",
  missing: "Coverage",
  line_match: "Belongs to this line",
  quote_value: "Price matches the quoted text",
  row_position: "Both reads point to the same photo row",
  ocr: "Local OCR (no AI) reads the same digits, green box",
};
