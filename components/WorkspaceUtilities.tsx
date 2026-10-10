"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useWS } from "./WorkspaceContext";

const PREF_KEY = "aerchain-sourcing-preferences-v1";
const SUPPLIER_KEY = "aerchain-sourcing-suppliers-v1";
const DIRECTORY_KEY = "aerchain-sourcing-directory-v1";
type SavedSupplier = { id: string; name: string; email: string };

export function ProfilePanel() {
  return <div className="utility-page profile-page"><div className="utility-intro"><div><span className="eyebrow">PROFILE PREVIEW</span><h2>Paul Mehta</h2><p>Category Buyer · Warner</p></div><span className="profile-avatar-large"><Image src="/brand/paul-avatar.svg" width={58} height={58} alt="Illustrated portrait of Paul" /></span></div><div className="profile-facts"><div><span>Workspace</span><strong>Warner</strong></div><div><span>Role</span><strong>Category Buyer</strong></div><div><span>Account</span><strong>Demo profile</strong></div></div><p className="settings-note">This profile is illustrative. Communication preferences and the supplier directory are under Settings.</p></div>;
}

export function SuppliersPanel({ onOpenResponses, onBack }: { onOpenResponses?: () => void; onBack?: () => void } = {}) {
  const { vendorIds, vendorName, run, setTab, stage } = useWS();
  const [selected, setSelected] = useState<string[]>(vendorIds.filter((id) => id !== "F"));
  const [customSuppliers, setCustomSuppliers] = useState<SavedSupplier[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUPPLIER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelected(JSON.parse(saved));
      const directory = localStorage.getItem(DIRECTORY_KEY);
      if (directory) setCustomSuppliers(JSON.parse(directory));
    } catch { /* Browser storage may be unavailable. */ }
  }, []);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    setSelected(next);
    try { localStorage.setItem(SUPPLIER_KEY, JSON.stringify(next)); } catch { /* Keep the in-session choice. */ }
  };
  const addSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const next = [...customSuppliers, { id: `saved-${Date.now()}`, name: newName.trim(), email: newEmail.trim() }];
    setCustomSuppliers(next);
    try { localStorage.setItem(DIRECTORY_KEY, JSON.stringify(next)); } catch { /* Keep the in-session choice. */ }
    setNewName(""); setNewEmail("");
  };
  return <div className="utility-page">
    {onBack && <button className="utility-link" onClick={onBack}>← Back to request</button>}
    <div className="utility-intro"><div><span className="eyebrow">SUPPLIER DIRECTORY</span><h2>Packaging suppliers</h2><p>Keep a shortlist and save other suppliers for future RFx outreach.</p></div><span className="utility-count">{selected.length} shortlisted</span></div>
    <div className="supplier-directory">
      {vendorIds.map((id) => {
        const q = run.questionnaire.find((item) => item.vendorId === id);
        return <label key={id} className="supplier-directory-row"><input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} /><span className="supplier-initial">{vendorName(id).charAt(0)}</span><span className="supplier-description"><strong>{vendorName(id)}</strong><small>{!run.vendors[id] ? "RFx recipient · reply added manually" : stage === "workspace" ? `${run.vendors[id].files.length} source file(s) · ${q?.clears === "yes" ? "Quality cleared" : q?.clears === "no" ? "Quality not cleared" : "Quality not confirmed"}` : "Available for RFx outreach"}</small></span><span className="supplier-state">{selected.includes(id) ? "On shortlist" : "Not shortlisted"}</span></label>;
      })}
      {customSuppliers.map((supplier) => <div key={supplier.id} className="supplier-directory-row"><span className="supplier-initial">{supplier.name.charAt(0).toUpperCase()}</span><span className="supplier-description"><strong>{supplier.name}</strong><small>{supplier.email || "No email saved"}</small></span><span className="supplier-state">Saved locally</span></div>)}
    </div>
    <form className="supplier-add" onSubmit={addSupplier}><strong>Add a supplier</strong><div><input aria-label="Supplier name" placeholder="Supplier name" value={newName} onChange={(event) => setNewName(event.target.value)} required /><input aria-label="Supplier email" type="email" placeholder="Email (optional)" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /><button type="submit">Add</button></div></form>
    {stage !== "brief" && <button className="utility-link" onClick={() => { setTab("responses"); onOpenResponses?.(); }}>Inspect their current replies <span aria-hidden="true">↗</span></button>}
  </div>;
}

export function SettingsPanel() {
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState("Email");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") as { email?: string; mode?: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored.email) setEmail(stored.email);
      if (stored.mode) setMode(stored.mode);
    } catch { /* Browser storage may be unavailable. */ }
  }, []);
  const save = () => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ email, mode })); } catch { /* Keep the in-session choice. */ }
    setSaved(true);
  };
  return <div className="utility-page settings-page">
    <div className="utility-intro"><div><span className="eyebrow">COMMUNICATION</span><h2>Your preferences</h2><p>These preferences are saved in this browser for future RFx work.</p></div></div>
    <label>Preferred reply-to email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setSaved(false); }} placeholder="paul@company.com" /></label>
    <label>Preferred supplier communication<select value={mode} onChange={(event) => { setMode(event.target.value); setSaved(false); }}><option>Email</option><option>Supplier portal</option><option>Both</option></select></label>
    <button className="primary-action" onClick={save}>Save preferences</button>{saved && <p className="saved-note" role="status">Preferences saved in this browser.</p>}
    <p className="settings-note">The current RFx dispatch is simulated; no supplier email is sent from this prototype.</p>
  </div>;
}

