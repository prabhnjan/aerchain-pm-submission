"use client";

import { useState } from "react";
import { draftReady } from "./tabs/DraftTab";
import { useWS } from "./WorkspaceContext";

const PROMPT = "I need an annual Corrugated Packaging RFx for our Hosur plant. Use our 30-item specification and tell me what I need to confirm.";
const COPY = [
  ["Start with a request", "Tell Aera what you need to buy. Next starts a fresh demo request and sends this brief to the real drafting agent."],
  ["Aera creates the RFx", "Aera is building the scope, 30 item specifications, supplier questionnaire and terms. Continue when the draft is ready."],
  ["Preview the items", "These are the 30 lines suppliers will price. Check the units, dimensions and annual quantities before dispatch."],
  ["Check supplier qualification", "Must-have answers determine which suppliers can enter a qualified award comparison."],
  ["Review commercial terms", "Currency, tax, delivery and payment terms shape whether quotes can be compared fairly."],
  ["Check the recipients", "The simulated RFx goes to six suppliers. Five replies are prepared for the tour; Unique Cartons is added manually."],
  ["Preview the email", "This is the request the suppliers will receive. Sending in this prototype is simulated."],
  ["Edit if needed", "Change the request name, description or delivery location, then Save. Cancel keeps the draft as it is."],
  ["Confirm the send", "Next opens the send confirmation. Nothing leaves the prototype until you confirm this simulated send."],
  ["Watch replies arrive", "The first prepared reply is here. Next reveals each remaining prepared reply, or receive all five at once."],
  ["Add the manual reply", "The sixth supplier is not part of the prepared batch. Next opens Add a reply for a document you choose."],
  ["Let Aera analyze the file", "Select Unique Cartons, attach its file, and press Save. Aera will extract and check it before the tour continues."],
  ["Compare the replies", "All received quotes now sit on the same lines and units. Missing values and uncertain conversions stay visible."],
  ["Ask Aera", "Ask a natural-language question over the comparison. Next asks what could change the award decision using the real analyst, so its answer must come from the received data."],
  ["Review the exceptions", "Check quality failures, flagged prices and original evidence before treating an award as final."],
  ["Choose how to place the order", "Compare the three choices: lowest price for each item, one supplier for everything, or an allocation using one or two suppliers. Each choice names who gets the items."],
  ["Create supplier drafts", "Next creates a separate draft for each supplier in the selected allocation. Open each draft to review its items, quantity, value and checks. Nothing is issued."],
] as const;

export function GuidedTour({ onClose, onLaunch }: { onClose: () => void; onLaunch: (text: string) => void }) {
  const ws = useWS();
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const ready = draftReady(ws.workingDraft, ws.lines, ws.questions, ws.terms);
  const manualReceived = ws.receivedVendorIds.includes("F");
  const blocked = (step === 1 && !ready) || (step === 7 && ws.tourEditOpen) || (step === 11 && !manualReceived) || (step === 12 && ws.stage !== "workspace");
  const next = () => {
    if (blocked) return;
    if (step === 0) { onLaunch(PROMPT); setStarted(true); setStep(1); return; }
    if (step >= 1 && step <= 5) { ws.setTourPreview((["items", "questions", "terms", "suppliers", "email"] as const)[step - 1]); setStep(step + 1); return; }
    if (step === 6) { ws.setTourPreview(null); ws.setTourEditOpen(true); setStep(7); return; }
    if (step === 7) { ws.sendRfx(); setStep(8); return; }
    if (step === 8) { if (!ws.draftApprovalAt) ws.confirmSendRfx(); setStep(9); return; }
    if (step === 9) { if (ws.repliesIn < ws.demoSupplierCount) ws.receiveNextReply(); else setStep(10); return; }
    if (step === 10) { if (!manualReceived) ws.setUploadOpen(true); setStep(11); return; }
    if (step === 11) { ws.openPanel({ kind: "compare" }); setStep(12); return; }
    if (step === 12) { ws.askFromAnywhere("What could change the award decision?"); setStep(13); return; }
    if (step === 13) { ws.openPanel({ kind: "review" }); setStep(14); return; }
    if (step === 14) { ws.openPanel({ kind: "award", presetId: "vp" }); setStep(15); return; }
    if (step === 15) { ws.setSupplierDraftPreset("vp"); setStep(16); return; }
    onClose();
  };
  const leave = () => { ws.setTourPreview(null); ws.setTourEditOpen(false); onClose(); };
  const label = step === 9 ? ws.repliesIn < ws.demoSupplierCount ? "Next reply" : "Continue" : step === 11 ? "Continue to comparison" : step === 15 ? "Create drafts" : step === 16 ? "Finish tour" : "Next";
  return <section className="guided-tour" role="dialog" aria-label="Product tour" aria-live="polite">
    <div className="guided-tour-top"><span>PRODUCT TOUR · {step + 1} OF {COPY.length}</span><button onClick={leave} aria-label="Close tour">✕</button></div>
    <div className="guided-tour-progress"><i style={{ width: `${((step + 1) / COPY.length) * 100}%` }} /></div>
    <h2>{COPY[step][0]}</h2><p>{COPY[step][1]}</p>
    {step === 1 && !ready && <small>{ws.draftBusy ? "Aera is drafting…" : "Waiting for the draft. If the request failed, retry below."}</small>}
    {step === 9 && <small>{ws.repliesIn} of {ws.demoSupplierCount} prepared replies received</small>}
    {step === 11 && <><a href="/tour/UniqueCartons_quote.csv" download>Download the example reply ↗</a><small>{manualReceived ? "Unique Cartons has been analyzed." : "Choose the downloaded CSV or your own supplier file in the upload window."}</small></>}
    {step === 12 && ws.stage !== "workspace" && <small>Finishing the comparison…</small>}
    <div className="guided-tour-actions">
      {step === 1 && !ws.draftBusy && !ready && started && <button className="guided-tour-secondary" onClick={() => onLaunch(PROMPT)}>Retry draft</button>}
      {step === 7 && ws.tourEditOpen && <button className="guided-tour-secondary" onClick={() => ws.setTourEditOpen(false)}>Skip editing</button>}
      {step === 9 && ws.repliesIn < ws.demoSupplierCount && <button className="guided-tour-secondary" onClick={() => { ws.showAllReplies(); setStep(10); }}>Receive all five</button>}
      {step === 11 && !manualReceived && !ws.uploadOpen && <button className="guided-tour-secondary" onClick={() => ws.setUploadOpen(true)}>Open upload</button>}
      <button className="guided-tour-next" disabled={blocked} onClick={next}>{label} <span aria-hidden="true">→</span></button>
    </div>
  </section>;
}
