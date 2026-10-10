// What Aera found, in plain sentences. Every sentence is computed here from the scenario engine (never by the
// model) and carries the exact cells or suppliers it is about, so the comparison table can highlight them in place.
import { runScenario, robustness, type Ctx } from "@/lib/scenario";
import { PRESETS } from "@/lib/scenario/presets";
import { inrBig } from "@/lib/format";
import type { Cell } from "@/lib/pipeline/types";
import type { VendorTerms } from "@/lib/pipeline/normalise";
import type { QuestionnaireResult } from "@/lib/questionnaire";
import type { Focus } from "@/components/WorkspaceContext";

export type InsightAction = "focus" | "decide" | "supplier" | "review";
export interface Insight {
  id: string;
  tone: "risk" | "saving" | "info";
  title: string;
  body: string;
  focus: Focus;
  action?: { kind: InsightAction; label: string; vendorId?: string };
}

const key = (c: { vendorId: string; lineId: string }) => `${c.vendorId}|${c.lineId}`;
const priceOf = (c: Cell) => c.landedPerPiece ?? (c.landedRange ? (c.landedRange[0] + c.landedRange[1]) / 2 : c.inrPerPiece);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const listJoin = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
export const isFlagged = (c: Cell) => c.status === "needs_review" || c.status === "carried";

export function buildInsights(args: { ctx: Ctx; cells: Cell[]; vendorIds: string[]; vendorName: (id: string) => string; questionnaire: QuestionnaireResult[]; terms: VendorTerms[]; lineCount: number; acceptedTerms: string[] }): Insight[] {
  const { ctx, cells, vendorIds, vendorName, questionnaire, terms, lineCount, acceptedTerms } = args;
  const short = (id: string) => { const w = vendorName(id).split(" "); return /^(sri|shree|shri|the)$/i.test(w[0]) ? w.slice(0, 2).join(" ") : w[0]; };
  const out: Insight[] = [];
  const vp = runScenario(PRESETS.find((p) => p.id === "vp")!.rule, ctx);
  const one = runScenario(PRESETS.find((p) => p.id === "one")!.rule, ctx);
  const rb = robustness(PRESETS.find((p) => p.id === "vp")!.rule, ctx);
  const cleared = vendorIds.filter((v) => questionnaire.find((q) => q.vendorId === v)?.clears === "yes");
  const notCleared = vendorIds.filter((v) => !cleared.includes(v));

  // 1. Who can actually be awarded.
  if (notCleared.length) {
    const why = notCleared.map((v) => {
      const q = questionnaire.find((x) => x.vendorId === v);
      if (!q || q.clears === "not_answered") return `${short(v)} didn't answer the questionnaire`;
      const n = q.failedMustHaves.length;
      return `${short(v)} missed ${n} must-have${n === 1 ? "" : "s"}`;
    });
    out.push({
      id: "qualified", tone: "info",
      title: `${cleared.length} of ${vendorIds.length} suppliers cleared your quality checks`,
      body: `Only ${listJoin(cleared.map(short))} can be awarded under your rules. ${listJoin(why)}.`,
      focus: { label: `Suppliers that cleared quality: ${listJoin(cleared.map(short))}`, vendors: cleared },
    });
  }

  // 2. The supplier that looks cheapest, and whether that holds.
  const ratio = vendorIds.map((v) => {
    const rs: number[] = [];
    for (const l of ctx.lines) {
      const mine = cells.find((c) => c.vendorId === v && c.lineId === l.id);
      const others = cells.filter((c) => c.vendorId !== v && c.lineId === l.id).map(priceOf).filter((x): x is number => x != null);
      const p = mine ? priceOf(mine) : null;
      if (p != null && others.length) rs.push(p / median(others));
    }
    return { v, r: rs.length ? median(rs) : 1, n: rs.length };
  }).sort((a, b) => a.r - b.r)[0];
  if (ratio && ratio.r < 0.92) {
    const vc = cells.filter((c) => c.vendorId === ratio.v && c.inrPerPiece != null);
    const flagged = vc.filter(isFlagged).length;
    const q = questionnaire.find((x) => x.vendorId === ratio.v);
    const caveats = [q?.clears === "not_answered" ? "didn't answer the quality questionnaire" : q?.clears === "no" ? "didn't clear the quality questionnaire" : "", flagged ? `${flagged} of its ${vc.length} prices need checking` : ""].filter(Boolean);
    out.push({
      id: "cheapest", tone: caveats.length ? "risk" : "saving",
      title: `${short(ratio.v)} looks ${Math.round((1 - ratio.r) * 100)}% cheaper than the others`,
      body: caveats.length ? `But it ${listJoin(caveats)}. It's shown for reference and kept out of the qualified award.` : "Its prices passed every check.",
      focus: { label: `${vendorName(ratio.v)}'s prices`, vendors: [ratio.v], cells: vc.filter(isFlagged).map(key) },
      action: { kind: "supplier", label: `Open ${short(ratio.v)}'s reply`, vendorId: ratio.v },
    });
  }

  // 3. The award itself: the split the VP asked for vs one supplier with its volume discount.
  const singleOk = one.uncoveredLines.length === 0 && !one.moqNotes.some((n) => n.startsWith("BLOCKER"));
  const winners = vp.lines.filter((a) => a.vendorId).map((a) => key({ vendorId: a.vendorId!, lineId: a.lineId }));
  if (singleOk && one.totalAfterDiscountsInr < vp.totalAfterDiscountsInr) {
    const disc = one.discountsApplied.find((d) => d.met);
    out.push({
      id: "award", tone: "saving",
      title: `One supplier is ${inrBig(vp.totalAfterDiscountsInr - one.totalAfterDiscountsInr)} cheaper than splitting`,
      body: `Cheapest per line among qualified suppliers costs ${inrBig(vp.totalAfterDiscountsInr)} a year. All ${lineCount} items to ${short(one.byVendor[0].vendorId)} cost ${inrBig(one.totalAfterDiscountsInr)}${disc ? ` after its ${disc.percent}% volume discount applies to more of the annual spend. The split also meets the discount threshold, but on fewer lines` : ""}. Check capacity and terms before deciding.`,
      focus: { label: "Lowest qualified price on each line", cells: winners },
      action: { kind: "decide", label: "Compare award options" },
    });
  } else {
    out.push({
      id: "award", tone: "info",
      title: `The qualified split costs ${inrBig(vp.totalAfterDiscountsInr)} a year`,
      body: `${vp.byVendor.map((b) => `${short(b.vendorId)} ${b.lines} items`).join(", ")}.${vp.uncoveredLines.length ? ` ${vp.uncoveredLines.length} items have no qualified quote.` : ""}`,
      focus: { label: "Lowest qualified price on each line", cells: winners },
      action: { kind: "decide", label: "Compare award options" },
    });
  }

  // 4. What to check: flagged values, and whether any could change the award.
  const flagged = cells.filter(isFlagged);
  const eligibleFlagged = flagged.filter((cell) => cleared.includes(cell.vendorId));
  const excludedFlagged = flagged.length - eligibleFlagged.length;
  const decisive = rb.critical.filter((c) => c.couldChangeWinner !== false);
  if (decisive.length) {
    out.push({
      id: "check", tone: "risk",
      title: `${decisive.length} price${decisive.length === 1 ? "" : "s"} could change the award`,
      body: `Of ${eligibleFlagged.length} flagged values from award-eligible suppliers, these could change the winner. Check them against the original reply before deciding.${excludedFlagged ? ` Another ${excludedFlagged} flagged values belong to suppliers who haven't cleared quality.` : ""}`,
      focus: { label: "Prices that could change the award", cells: decisive.map(key) },
      action: { kind: "review", label: "See why each is flagged" },
    });
  } else if (eligibleFlagged.length) {
    out.push({
      id: "check", tone: "info",
      title: `${eligibleFlagged.length} eligible prices need a source check`,
      body: `The qualified award stays the same at the edges of their plausible ranges. Confirm them before final approval.${excludedFlagged ? ` ${excludedFlagged} other flagged prices are from suppliers who haven't cleared quality.` : ""}`,
      focus: { label: "Eligible values to check", cells: eligibleFlagged.map(key) },
      action: { kind: "review", label: "See why each is flagged" },
    });
  }

  // 5. Gaps: items not quoted.
  const missing = cells.filter((c) => c.status === "missing");
  if (missing.length) {
    const by = vendorIds.map((v) => ({ v, n: missing.filter((c) => c.vendorId === v).length })).filter((x) => x.n);
    out.push({
      id: "missing", tone: "info",
      title: `${missing.length} item${missing.length === 1 ? " wasn't" : "s weren't"} quoted`,
      body: `${listJoin(by.map((x) => `${short(x.v)} skipped ${x.n}`))}. They're left out of that supplier's totals, never counted as zero.`,
      focus: { label: "Items not quoted", cells: missing.map(key) },
    });
  }

  // 6. Terms on suppliers who would win that only the buyer can accept (discount conditions are covered by the award finding).
  const awarded = new Set(vp.byVendor.map((b) => b.vendorId));
  const open = terms.filter((t) => awarded.has(t.vendorId) && !acceptedTerms.includes(t.vendorId)).map((t) => ({ t, flags: t.flags.filter((f) => !/^Conditional discount/i.test(f)) })).filter((x) => x.flags.length);
  if (open.length) out.push({
    id: "terms", tone: "risk",
    title: open.length === 1 ? `Decide on ${short(open[0].t.vendorId)}'s terms` : `${open.length} suppliers have terms only you can accept`,
    body: open.map((x) => `${short(x.t.vendorId)}: ${x.flags[0]}`).join(" "),
    focus: { label: open.map((x) => vendorName(x.t.vendorId)).join(", "), vendors: open.map((x) => x.t.vendorId) },
    action: { kind: "supplier", label: "Accept or ask for clarification", vendorId: open[0].t.vendorId },
  });
  const order = ["award", "cheapest", "check", "terms", "qualified", "missing"];
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
