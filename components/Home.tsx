"use client";

import { useState, type FormEvent } from "react";

const portfolio = [
  { label: "Sourcing events in motion", value: "12", detail: "4 waiting for bids · 3 in evaluation" },
  { label: "Contracts up for renewal", value: "7", detail: "Within the next 90 days" },
  { label: "Approvals awaiting sign-off", value: "₹2.1 Cr", detail: "Across 5 purchase decisions" },
  { label: "Supplier risks to review", value: "3", detail: "Compliance or delivery exceptions" },
];

const queue = [
  { kind: "Renewal", title: "Facilities maintenance agreement", detail: "Expires in 38 days · owner action needed", tone: "warning" },
  { kind: "Evaluation", title: "Fleet services bids", detail: "Four supplier offers ready for review", tone: "info" },
  { kind: "Supplier risk", title: "Industrial valves compliance", detail: "Certificate expires before the next order", tone: "alert" },
];

export function Home({ createRequest, startWithPrompt }: { createRequest: () => void; startWithPrompt: (text: string) => boolean }) {
  const [prompt, setPrompt] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (prompt.trim() && startWithPrompt(prompt.trim())) setPrompt(""); };
  return <div className="home-page">
    <div className="home-intro"><div><span className="eyebrow">PROCUREMENT OVERVIEW</span><h1>Good morning, Paul.</h1><p>Here is what is moving across your sourcing portfolio.</p></div><span className="home-sample">Illustrative portfolio snapshot</span></div>
    <div className="home-stat-grid">{portfolio.map((item) => <div className="home-stat" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
    <div className="home-main-grid">
      <section className="home-queue"><div className="home-section-head"><span className="eyebrow">NEEDS YOUR ATTENTION</span><h2>What to look at next</h2></div><div className="home-queue-list">{queue.map((item) => <div className="home-queue-item" key={item.title}><span className={`home-queue-dot ${item.tone}`} /><div><small>{item.kind}</small><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div></section>
      <section className="home-start"><span className="eyebrow">START WITH AERA</span><h2>What do you need to source?</h2><p>Describe your requirement. Aera will shape the RFx with you in the workspace.</p>
        <form onSubmit={submit}><label className="sr-only" htmlFor="home-prompt">Describe your sourcing request</label><input id="home-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a product or service…" /><button disabled={!prompt.trim()} type="submit">Start →</button></form>
        <button className="home-create" onClick={createRequest}>Create a request <span aria-hidden="true">↗</span></button>
      </section>
    </div>
    <p className="home-note">Portfolio figures and queue items are illustrative demo data. They are separate from the corrugated packaging RFx.</p>
  </div>;
}
