"use client";
import { qualification, capacityFrom } from "@/lib/questionnaire/eligibility";
import { QUESTIONNAIRE as QUESTIONNAIRE_FOR_QUAL } from "@/data/rfx";
// Shared client state: the current run, the buyer's overrides (kept in localStorage), the open source drawer.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RunData } from "@/lib/state";
import type { Cell, Override } from "@/lib/pipeline/types";
import type { LineSpec } from "@/lib/domain/spec";
import type { Question } from "@/data/rfx";
import type { Reference } from "@/lib/pipeline/normalise";
import type { Ctx } from "@/lib/scenario";
import type { Draft } from "@/lib/copilot";
import { applyOverrides } from "@/lib/overrides";

export interface StaticData {
  lines: LineSpec[];
  buyer: { company: string; plant: string; rfxId: string; title: string; issued: string; replyBy: string };
  questions: Question[];
  terms: string[];
  reference: Reference;
  evals: { cells: unknown; traps: unknown; heldout: unknown; heldoutBefore: unknown; heldoutG: unknown; heldoutGFirst: unknown; heldoutHFirst: unknown };
}

export type TermDecision = { status: "accepted" | "clarify"; note: string; at: string };
/** Where the buyer is in the journey: shaping the brief → replies arriving → one comparison workspace. */
export type Stage = "brief" | "replies" | "workspace";
/** Detail opened on top of the workspace, so the buyer never loses their place. */
export type Panel = { kind: "brief" } | { kind: "replies" } | { kind: "compare" } | { kind: "supplier"; vendorId: string } | { kind: "review" } | { kind: "award"; presetId?: string } | { kind: "evidence" } | null;
export type Win = NonNullable<Panel>;
/** Cells (vendorId|lineId) and columns an insight points at; the table highlights them in place. */
export type Focus = { label: string; cells?: string[]; vendors?: string[]; lines?: string[] } | null;

interface WS extends StaticData {
  run: RunData;
  setRun: (r: RunData) => void;
  overrides: Override[];
  addOverride: (o: Override) => void;
  clearOverrides: () => void;
  resetDemo: () => void;
  storedRunAt: string; // when the stored (seed) run was produced by the real models
  liveReads: Record<string, string>; // vendorId → time it was re-read live in this session
  markLive: (vendorId: string) => void;
  pendingQuestion: string | null; // set by the header Ask bar, consumed by the Ask tab (audit F20)
  askFromAnywhere: (q: string) => void;
  takePendingQuestion: () => string | null;
  copilotOpen: boolean;
  setCopilotOpen: (open: boolean) => void;
  cells: Cell[];
  ctx: Ctx;
  vendorIds: string[];
  vendorName: (id: string) => string;
  openSource: (vendorId: string, lineId: string) => void;
  source: { vendorId: string; lineId: string } | null;
  closeSource: () => void;
  tab: string;
  setTab: (t: string) => void;
  workingDraft: Draft["draft"] | null;
  setWorkingDraft: (draft: Draft["draft"] | null) => void;
  draftDestination: string;
  setDraftDestination: (value: string) => void;
  draftApprovalAt: string | null;
  markDraftApproved: () => void;
  responseFocus: string | null;
  openResponses: (vendorId: string) => void;
  showAllResponses: () => void;
  draftBusy: boolean;
  setDraftBusy: (b: boolean) => void;
  stage: Stage;
  setStage: (s: Stage) => void;
  panel: Panel; // the last thing the buyer asked to see on the canvas
  openPanel: (p: Panel) => void; // scrolls the canvas to it and expands it in place
  target: { win: Win; n: number } | null;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  awardPreset: string | null;
  setAwardPreset: (p: string | null) => void;
  supplierDraftPreset: string | null;
  setSupplierDraftPreset: (p: string | null) => void;
  reviewOpen: boolean;
  setReviewOpen: (b: boolean) => void;
  repliesIn: number; // how many supplier replies have arrived since sending
  demoSupplierCount: number;
  receivedVendorIds: string[];
  registerUploadedReply: (vendorId: string, files: File[]) => void;
  fileUrl: (fileName: string) => string;
  sendRfx: () => void;
  sendConfirmationOpen: boolean;
  confirmSendRfx: () => void;
  cancelSendRfx: () => void;
  receiveNextReply: () => void;
  showAllReplies: () => void;
  tourPreview: "items" | "questions" | "terms" | "email" | "suppliers" | null;
  setTourPreview: (value: WS["tourPreview"]) => void;
  tourEditOpen: boolean;
  setTourEditOpen: (open: boolean) => void;
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  termDecisions: Record<string, TermDecision>;
  saveTermDecision: (vendorId: string, status: TermDecision["status"], note: string) => void;
}

/** Letterheads shout ("SRI VENKATESHA CORRUGATORS PVT LTD"); show names the way a buyer writes them. */
const tidyName = (n: string) => n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bPvt\b/, "Pvt").replace(/\bLlp\b/, "LLP") : n;

const C = createContext<WS | null>(null);
export const useWS = () => {
  const v = useContext(C);
  if (!v) throw new Error("useWS outside provider");
  return v;
};

const KEY = "quote-desk-overrides-v1";
const TERM_KEY = "quote-desk-term-decisions-v1";
const DISPATCH_KEY = "quote-desk-demo-dispatch-v1";
const STAGE_KEY = "quote-desk-stage-v1";
const REPLIES_KEY = "quote-desk-replies-v1";
const MANUAL_SUPPLIER = { id: "F", name: "Unique Cartons" };

export function WorkspaceProvider({ initialRun, data, children }: { initialRun: RunData; data: StaticData; children: ReactNode }) {
  const [run, setRun] = useState(initialRun);
  const [uploadedVendorIds, setUploadedVendorIds] = useState<string[]>([]);
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [source, setSource] = useState<{ vendorId: string; lineId: string } | null>(null);
  const [tab, setTab] = useState("draft"); // a new buyer starts with the RFx, before any replies exist
  const [liveReads, setLiveReads] = useState<Record<string, string>>({});
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [workingDraft, setWorkingDraft] = useState<Draft["draft"] | null>(null);
  const [draftDestination, setDraftDestination] = useState(data.buyer.plant);
  const [draftApprovalAt, setDraftApprovalAt] = useState<string | null>(null);
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const [responseFocus, setResponseFocus] = useState<string | null>(null);
  const [termDecisions, setTermDecisions] = useState<Record<string, TermDecision>>({});
  const [stage, setStageState] = useState<Stage>("brief");
  const [repliesIn, setRepliesIn] = useState(0);
  // The canvas is always on. "Opening" something scrolls the canvas to it and expands it in place.
  const [target, setTarget] = useState<{ win: Win; n: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null); // supplier shown in full on the canvas
  const [awardPreset, setAwardPreset] = useState<string | null>(null); // award option shown in full
  const [supplierDraftPreset, setSupplierDraftPreset] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const panel: Panel = target?.win ?? null;
  const setPanel = (p: Panel) => {
    if (!p) { setTarget(null); return; }
    if (p.kind === "supplier") setExpanded(p.vendorId);
    if (p.kind === "award") setAwardPreset(p.presetId ?? "vp");
    if (p.kind === "review") setReviewOpen(true);
    setTarget((t) => ({ win: p, n: (t?.n ?? 0) + 1 }));
  };

  const [focus, setFocus] = useState<Focus>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [tourPreview, setTourPreview] = useState<WS["tourPreview"]>(null);
  const [tourEditOpen, setTourEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // Read browser-only state after hydration; it cannot be part of the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setOverrides(JSON.parse(saved));
      const savedTerms = localStorage.getItem(TERM_KEY);
      if (savedTerms) setTermDecisions(JSON.parse(savedTerms));
      const sentAt = localStorage.getItem(DISPATCH_KEY);
      if (sentAt) {
        const st = (localStorage.getItem(STAGE_KEY) as Stage) || "workspace";
        setDraftApprovalAt(sentAt); setStageState(st);
        setRepliesIn(st === "workspace" ? Object.keys(initialRun.vendors).length : Math.min(Number(localStorage.getItem(REPLIES_KEY) ?? 0) || 0, Object.keys(initialRun.vendors).length));
      }
    } catch { /* storage unavailable: start clean */ }
    // The initial run is stable for this provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persist = (o: Override[]) => {
    setOverrides(o);
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ }
  };

  const cells = useMemo(() => applyOverrides(run.cells, overrides), [run, overrides]);
  const ctx: Ctx = useMemo(() => ({
    lines: data.lines, cells, terms: run.terms, history: data.reference.history,
    ...qualification(run.questionnaire, QUESTIONNAIRE_FOR_QUAL), capacity: capacityFrom(run.vendors),
  }), [data, cells, run]);
  const vendorIds = useMemo(() => [...new Set([...run.cells.map((c) => c.vendorId), MANUAL_SUPPLIER.id])].sort(), [run]);
  const seedVendorIds = useMemo(() => Object.keys(initialRun.vendors).sort(), [initialRun]);
  const receivedVendorIds = useMemo(() => [...new Set([...seedVendorIds.slice(0, repliesIn), ...uploadedVendorIds])].sort(), [seedVendorIds, repliesIn, uploadedVendorIds]);
  const setStage = (next: Stage) => {
    setStageState(next);
    try { localStorage.setItem(STAGE_KEY, next); } catch { /* ignore */ }
  };
  // The first example reply arrives with dispatch; the buyer advances the rest with Next.
  const supplierCount = seedVendorIds.length;
  useEffect(() => {
    const allReceived = vendorIds.every((id) => receivedVendorIds.includes(id));
    if (stage === "replies" && allReceived) { const t = setTimeout(() => setStage("workspace"), 900); return () => clearTimeout(t); }
    if (stage === "workspace" && !allReceived) { const t = setTimeout(() => setStage("replies"), 0); return () => clearTimeout(t); }
    // Five prepared replies can be advanced with Next; the sixth arrives through upload.
  }, [stage, vendorIds, receivedVendorIds]);
  useEffect(() => { try { localStorage.setItem(REPLIES_KEY, String(repliesIn)); } catch { /* ignore */ } }, [repliesIn]);
  // Older components still ask for a "tab"; each one now opens as a panel over the same workspace.
  const navigate = (nextTab: string) => {
    if (nextTab === "ask") { setCopilotOpen(true); return; }
    setTab(nextTab);
    if (nextTab === "draft") setPanel({ kind: "brief" });
    else if (nextTab === "review") setPanel({ kind: "review" });
    else if (nextTab === "award") setPanel({ kind: "award" });
    else if (nextTab === "evidence") setPanel({ kind: "evidence" });
    else if (nextTab === "responses") setPanel(responseFocus ? { kind: "supplier", vendorId: responseFocus } : null);
    else setPanel(null);
  };

  const value: WS = {
    ...data, run, setRun, overrides,
    addOverride: (o) => persist([...overrides, o]),
    clearOverrides: () => persist([]),
    resetDemo: () => { persist([]); Object.values(uploadedFileUrls).forEach((url) => URL.revokeObjectURL(url)); setUploadedFileUrls({}); setUploadedVendorIds([]); setRun(initialRun); setSource(null); setLiveReads({}); setPendingQuestion(null); setCopilotOpen(false); setWorkingDraft(null); setDraftBusy(false); setDraftDestination(data.buyer.plant); setDraftApprovalAt(null); setSendConfirmationOpen(false); setResponseFocus(null); setTermDecisions({}); setTab("draft"); setStageState("brief"); setTarget(null); setExpanded(null); setAwardPreset(null); setSupplierDraftPreset(null); setReviewOpen(false); setRepliesIn(0); setFocus(null); setTourPreview(null); setTourEditOpen(false); setUploadOpen(false); try { localStorage.removeItem(TERM_KEY); localStorage.removeItem(DISPATCH_KEY); localStorage.removeItem(STAGE_KEY); localStorage.removeItem(REPLIES_KEY); } catch { /* ignore */ } },
    pendingQuestion,
    askFromAnywhere: (q) => { setPendingQuestion(q); setCopilotOpen(true); },
    takePendingQuestion: () => { const q = pendingQuestion; if (q) setPendingQuestion(null); return q; },
    copilotOpen, setCopilotOpen,
    storedRunAt: initialRun.ranAt, liveReads, markLive: (v) => setLiveReads((m) => ({ ...m, [v]: new Date().toISOString() })),
    cells, ctx, vendorIds,
    vendorName: (id) => tidyName(run.vendors[id]?.extraction?.vendor_name || (id === MANUAL_SUPPLIER.id ? MANUAL_SUPPLIER.name : `Vendor ${id}`)),
    openSource: (vendorId, lineId) => setSource({ vendorId, lineId }),
    source, closeSource: () => setSource(null),
    tab, setTab: navigate, workingDraft, setWorkingDraft, draftDestination, setDraftDestination, draftApprovalAt,
    markDraftApproved: () => { const at = new Date().toISOString(); setDraftApprovalAt(at); try { localStorage.setItem(DISPATCH_KEY, at); } catch { /* ignore */ } },
    responseFocus,
    openResponses: (vendorId) => { setResponseFocus(vendorId); setPanel({ kind: "supplier", vendorId }); },
    showAllResponses: () => setResponseFocus(null),
    draftBusy, setDraftBusy, stage, setStage, panel, openPanel: setPanel, target, expanded, setExpanded, awardPreset, setAwardPreset, supplierDraftPreset, setSupplierDraftPreset, reviewOpen, setReviewOpen,
    sendRfx: () => setSendConfirmationOpen(true),
    sendConfirmationOpen,
    cancelSendRfx: () => setSendConfirmationOpen(false),
    confirmSendRfx: () => { const at = new Date().toISOString(); setDraftApprovalAt(at); setSendConfirmationOpen(false); try { localStorage.setItem(DISPATCH_KEY, at); } catch { /* ignore */ } setRepliesIn(1); setStage("replies"); setPanel({ kind: "replies" }); },
    receiveNextReply: () => setRepliesIn((count) => Math.min(count + 1, supplierCount)),
    showAllReplies: () => setRepliesIn(supplierCount), repliesIn, demoSupplierCount: supplierCount, receivedVendorIds,
    tourPreview, setTourPreview, tourEditOpen, setTourEditOpen, uploadOpen, setUploadOpen,
    registerUploadedReply: (vendorId, files) => {
      const nextFiles = Object.fromEntries(files.map((file) => [`${vendorId}_${file.name}`, URL.createObjectURL(file)]));
      for (const name of Object.keys(nextFiles)) if (uploadedFileUrls[name]) URL.revokeObjectURL(uploadedFileUrls[name]);
      setUploadedVendorIds((ids) => ids.includes(vendorId) ? ids : [...ids, vendorId]);
      setUploadedFileUrls((urls) => ({ ...urls, ...nextFiles }));
    },
    fileUrl: (fileName) => uploadedFileUrls[fileName] ?? `/replies/${encodeURIComponent(fileName)}`,
    focus, setFocus,
    termDecisions,
    saveTermDecision: (vendorId, status, note) => {
      const next = { ...termDecisions, [vendorId]: { status, note: note.trim(), at: new Date().toISOString() } };
      setTermDecisions(next);
      try { localStorage.setItem(TERM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
