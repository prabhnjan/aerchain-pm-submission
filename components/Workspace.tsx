"use client";
// The sourcing app stays on the left; Aera remains available on the right throughout the RFx.
import { useState } from "react";
import Image from "next/image";
import { useWS } from "./WorkspaceContext";
import { SourceDrawer } from "./SourceDrawer";
import { Chat } from "./chat/Chat";
import { Canvas, type ArchivedRequest } from "./canvas/Canvas";
import { Home } from "./Home";
import { ProfilePanel, SettingsPanel, SuppliersPanel } from "./WorkspaceUtilities";
import { GuidedTour } from "./GuidedTour";

export function Workspace() {
  const { resetDemo, openPanel, buyer, draftApprovalAt, workingDraft, draftDestination, stage, receivedVendorIds, lines, terms, sendConfirmationOpen, confirmSendRfx, cancelSendRfx, vendorIds } = useWS();
  const [view, setView] = useState<"home" | "workspace" | "suppliers" | "settings" | "profile">("workspace");
  const [homeHint, setHomeHint] = useState(false);
  const [menu, setMenu] = useState<"profile" | "settings" | null>(null);
  const [requestId, setRequestId] = useState(0);
  const [archived, setArchived] = useState<ArchivedRequest[]>([]);
  const [launchPrompt, setLaunchPrompt] = useState<{ id: number; text: string } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const restartDemo = () => { resetDemo(); setArchived([]); setRequestId((n) => n + 1); setLaunchPrompt(null); setView("workspace"); setMenu(null); setHomeHint(false); };
  const archiveCurrent = () => {
    if (!workingDraft && !draftApprovalAt) return;
    const now = new Date();
    setArchived((records) => [{ id: `${buyer.rfxId}-session-${now.getTime()}`, title: workingDraft?.title ?? buyer.title, date: now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), suppliers: vendorIds.length, location: buyer.plant, status: stage === "brief" ? "Draft" : stage === "workspace" ? "Ready to review" : "Awaiting replies", replies: `${receivedVendorIds.length} of ${vendorIds.length}`, next: stage === "brief" ? "Review the draft" : stage === "workspace" ? "Review checks" : "Wait for remaining replies", detail: workingDraft?.scope ?? `Corrugated packaging RFx for ${buyer.plant}.`, items: workingDraft?.lines.length ?? lines.length, terms: workingDraft?.terms.length ?? terms.length }, ...records]);
  };
  const createRequest = () => {
    if ((draftApprovalAt || workingDraft || stage !== "brief") && !window.confirm("Start a new request? The current request will become a read-only summary in this session. Its source files and review decisions won't carry over.")) return;
    archiveCurrent();
    resetDemo(); setRequestId((n) => n + 1); setLaunchPrompt(null); setView("workspace");
  };
  const startWithPrompt = (text: string) => {
    if ((draftApprovalAt || workingDraft || stage !== "brief") && !window.confirm("Start a new request with this prompt? The current request will become a read-only summary in this session.")) return false;
    archiveCurrent();
    resetDemo(); setRequestId((n) => n + 1); setLaunchPrompt({ id: Date.now(), text }); setView("workspace"); return true;
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand"><span className="buyer-mark warner-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M28 3 36 7v26l-8 4V3Z" fill="#871ad6"/><path d="m7 13 8-6 16 13-16 13-8-6 11-7L7 13Z" fill="#ad46ff"/><path d="m7 13 6 4-5 3 5 3-6 4-5-7 5-7Z" fill="#5e178c"/></svg></span><strong>Warner</strong></div>
        <nav className="workspace-nav" aria-label="Main navigation">
          <span className="home-nav-wrap"><button onClick={() => { setHomeHint(true); setMenu(null); }} onMouseEnter={() => setHomeHint(true)} onMouseLeave={() => setHomeHint(false)} onFocus={() => setHomeHint(true)} onBlur={() => setHomeHint(false)} aria-describedby="home-scope-hint"><span aria-hidden="true">⌂</span> Home</button><span id="home-scope-hint" className={`home-scope-hint ${homeHint ? "is-visible" : ""}`} role="tooltip">This is out of scope for this demo.</span></span>
          <button className={view === "workspace" ? "is-active" : ""} aria-current={view === "workspace" ? "page" : undefined} onClick={() => { setView("workspace"); setMenu(null); setHomeHint(false); }}><span aria-hidden="true">▦</span> Requests</button>
        </nav>
        <div className="topbar-actions"><button className="take-tour-button" onClick={() => { setMenu(null); setView("workspace"); setTourOpen(true); }}>Take a Tour</button><span className="topbar-greeting">Hello Paul <span aria-hidden="true">👋</span></span><div className="account-controls" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setMenu(null); }} onKeyDown={(event) => { if (event.key === "Escape") setMenu(null); }}><button className="account-avatar" aria-label="Open Paul’s profile" aria-expanded={menu === "profile"} onClick={() => setMenu(menu === "profile" ? null : "profile")}><Image src="/brand/paul-avatar.svg" width={34} height={34} alt="" /></button><button className="account-settings" aria-label="Open settings menu" aria-expanded={menu === "settings"} onClick={() => setMenu(menu === "settings" ? null : "settings")}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.8 2h2.4l.5 2.2c.7.2 1.3.4 1.9.8l2-.9 1.7 1.7-.9 2c.4.6.6 1.2.8 1.9l2.2.5v2.4l-2.2.5c-.2.7-.4 1.3-.8 1.9l.9 2-1.7 1.7-2-.9c-.6.4-1.2.6-1.9.8l-.5 2.2h-2.4l-.5-2.2c-.7-.2-1.3-.4-1.9-.8l-2 .9-1.7-1.7.9-2c-.4-.6-.6-1.2-.8-1.9L2.6 12v-2.4l2.2-.5c.2-.7.4-1.3.8-1.9l-.9-2 1.7-1.7 2 .9c.6-.4 1.2-.6 1.9-.8z"/><circle cx="12" cy="10.8" r="3.1"/></svg></button>{menu && <div className="account-menu" role="menu">{menu === "profile" ? <><strong>Paul Mehta</strong><small>Category Buyer · Warner</small><button role="menuitem" onClick={() => { setView("profile"); setMenu(null); }}>Preview profile</button></> : <><strong>Workspace settings</strong><button role="menuitem" onClick={() => { setView("suppliers"); setMenu(null); }}>Supplier directory</button><button role="menuitem" onClick={() => { setView("settings"); setMenu(null); }}>Communication preferences</button><button role="menuitem" onClick={() => { setView("workspace"); openPanel({ kind: "evidence" }); setMenu(null); }}>Method &amp; evidence</button><button role="menuitem" className="reset-icon-button" aria-label="Reset demo" title="Reset demo" onClick={restartDemo}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 6.4"/><path d="M3 4v7h7"/></svg></button></>}</div>}</div></div>
      </header>
      <div className="app-body">
        <main className="canvas-col" aria-label="Sourcing workspace">{view === "home" ? <Home createRequest={createRequest} startWithPrompt={startWithPrompt} /> : view === "workspace" ? <Canvas key={requestId} archived={archived} onAddSuppliers={() => setView("suppliers")} /> : <div className="utility-wrap">{view === "suppliers" ? <SuppliersPanel onOpenResponses={() => setView("workspace")} onBack={() => setView("workspace")} /> : view === "profile" ? <ProfilePanel /> : <SettingsPanel />}</div>}</main>
        <aside className="chat-col" aria-label="Aera copilot"><div className="chat-dock-head"><span className="chat-orb" aria-hidden="true">✦</span><div><strong>Aera</strong><small>Sourcing copilot</small></div></div><Chat key={requestId} onStart={() => setView("workspace")} launchPrompt={launchPrompt} /></aside>
      </div>
      <SourceDrawer />
      {tourOpen && <GuidedTour onClose={() => setTourOpen(false)} onLaunch={(text) => { restartDemo(); setLaunchPrompt({ id: Date.now(), text }); }} />}
      {sendConfirmationOpen && <div className="send-confirm-backdrop" onClick={cancelSendRfx}><section className="send-confirm" role="alertdialog" aria-modal="true" aria-labelledby="send-confirm-title" onClick={(event) => event.stopPropagation()}><h2 id="send-confirm-title">Send this RFx to {vendorIds.length} suppliers?</h2>{draftDestination.trim().toLowerCase() !== buyer.plant.trim().toLowerCase() && <p className="send-confirm-mismatch">The draft destination is {draftDestination}; the example replies quote {buyer.plant}. Check landed costs before awarding.</p>}<div className="send-confirm-actions"><button onClick={cancelSendRfx}>Cancel</button><button className="primary-action" onClick={confirmSendRfx}>Confirm</button></div></section></div>}
    </div>
  );
}
