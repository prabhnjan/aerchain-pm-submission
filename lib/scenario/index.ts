// Award scenarios, computed in code (never by the model), plus the robustness check:
// "would the decision change if the uncertain numbers are wrong?"
import { pieceWeightGrams, round2, type LineSpec } from "@/lib/domain/spec";
import type { Cell } from "@/lib/pipeline/types";
import type { VendorTerms } from "@/lib/pipeline/normalise";

export interface ScenarioRule {
  rule: "cheapest_per_line" | "single_vendor" | "max_vendors";
  vendorFilter: "all" | "cleared_questionnaire" | string[];
  maxVendors?: number; // for max_vendors
  vendorId?: string; // for single_vendor
  basis?: "landed" | "quoted"; // default landed
  excludeUnconfirmed?: boolean; // skip cells still needing review
}

export interface Ctx {
  lines: LineSpec[];
  cells: Cell[];
  terms: VendorTerms[];
  cleared: Record<string, "yes" | "no" | "not_answered">;
  lineGate?: Record<string, Record<string, boolean>>; // vendor → line-scoped must-have → passed (audit F06)
  capacity?: Record<string, number | null>; // max awardable tonnes/month (spare ÷ 1.5); null = unknown
  history: { vendorId: string; lineId: string; inrPerPiece: number }[];
}

export interface AwardLine {
  lineId: string;
  vendorId: string | null;
  unitPrice: number | null;
  annualQty: number;
  annualValue: number | null;
  cellStatus: string | null;
  unconfirmed: boolean;
  runnerUp?: { vendorId: string; unitPrice: number };
}

export interface ScenarioResult {
  rule: ScenarioRule;
  vendorsConsidered: string[];
  vendorsExcluded: { vendorId: string; why: string }[];
  lines: AwardLine[];
  uncoveredLines: string[];
  totalInr: number; // covered lines only
  discountsApplied: { vendorId: string; percent: number; condition: string; met: boolean; monthlyTonnes: number; savingInr: number }[];
  totalAfterDiscountsInr: number;
  byVendor: { vendorId: string; lines: number; valueInr: number; monthlyTonnes: number }[];
  lastYearSameLinesInr: number | null;
  unconfirmedCellsUsed: number;
  assumptions: string[];
  capacityNotes: string[]; // lines moved because a vendor would exceed its capacity, or capacity unknown
  moqNotes: string[]; // awarded lines whose monthly call-off is below the vendor's MOQ (audit F21)
}

/** Point value used for ranking. Unknown freight → midpoint of the buyer's lane range. */
function priceOf(c: Cell, basis: "landed" | "quoted"): number | null {
  if (c.inrPerPiece == null) return null;
  if (basis === "quoted") return c.inrPerPiece;
  if (c.landedPerPiece != null) return c.landedPerPiece;
  if (c.landedRange) return round2((c.landedRange[0] + c.landedRange[1]) / 2);
  return c.inrPerPiece;
}

export function vendorsFor(rule: ScenarioRule, ctx: Ctx) {
  const all = [...new Set(ctx.cells.map((c) => c.vendorId))].sort();
  const excluded: { vendorId: string; why: string }[] = [];
  let ok = all;
  if (rule.vendorFilter === "cleared_questionnaire") {
    ok = all.filter((v) => ctx.cleared[v] === "yes" && (!ctx.capacity || ctx.capacity[v] != null));
    for (const v of all) {
      if (ctx.cleared[v] !== "yes") excluded.push({ vendorId: v, why: ctx.cleared[v] === "not_answered" ? "didn't answer the questionnaire" : "failed a must-have in the questionnaire" });
      else if (ctx.capacity && ctx.capacity[v] == null) excluded.push({ vendorId: v, why: "capacity not stated (a must-have can't pass on unknown)" });
    }
  } else if (Array.isArray(rule.vendorFilter)) {
    ok = all.filter((v) => (rule.vendorFilter as string[]).includes(v));
    for (const v of all) if (!ok.includes(v)) excluded.push({ vendorId: v, why: "not in the requested vendor list" });
  }
  return { ok, excluded };
}

function assign(rule: ScenarioRule, ctx: Ctx, vendors: string[], overrides?: Map<string, number>): AwardLine[] {
  const basis = rule.basis ?? "landed";
  return ctx.lines.map((l) => {
    const options = ctx.cells
      .filter((c) => c.lineId === l.id && vendors.includes(c.vendorId) && c.inrPerPiece != null && c.status !== "missing")
      .filter((c) => !rule.excludeUnconfirmed || c.status === "verified" || c.status === "converted")
      // Line-scoped qualification: under a "cleared quality" rule, food lines also need the food-safe declaration.
      .filter((c) => rule.vendorFilter !== "cleared_questionnaire" || !l.foodContact || ctx.lineGate?.[c.vendorId]?.Q09 !== false)
      .map((c) => ({ c, p: overrides?.get(`${c.vendorId}|${c.lineId}`) ?? (priceOf(c, basis) as number) }))
      .filter((o) => Number.isFinite(o.p)) // an infinite probe = "bid excluded"
      .sort((a, b) => a.p - b.p);
    const best = options[0];
    if (!best) return { lineId: l.id, vendorId: null, unitPrice: null, annualQty: l.annualQty, annualValue: null, cellStatus: null, unconfirmed: false };
    return {
      lineId: l.id, vendorId: best.c.vendorId, unitPrice: round2(best.p), annualQty: l.annualQty,
      annualValue: Math.round(best.p * l.annualQty), cellStatus: best.c.status,
      unconfirmed: best.c.status === "needs_review" || best.c.status === "carried",
      ...(options[1] ? { runnerUp: { vendorId: options[1].c.vendorId, unitPrice: round2(options[1].p) } } : {}),
    };
  });
}


/** Conditional discounts evaluated on the WHOLE allocation (a discount can depend on total volume awarded). */
function discountsFor(lines: AwardLine[], ctx: Ctx): { byVendor: ScenarioResult["byVendor"]; discountsApplied: ScenarioResult["discountsApplied"]; total: number; after: number } {
  const kg = (id: string) => pieceWeightGrams(ctx.lines.find((l) => l.id === id)!) / 1000;
  const byVendorMap = new Map<string, { lines: number; valueInr: number; tonnes: number }>();
  for (const a of lines) {
    if (!a.vendorId) continue;
    const e = byVendorMap.get(a.vendorId) ?? { lines: 0, valueInr: 0, tonnes: 0 };
    e.lines++; e.valueInr += a.annualValue ?? 0; e.tonnes += (kg(a.lineId) * a.annualQty) / 1000;
    byVendorMap.set(a.vendorId, e);
  }
  const byVendor = [...byVendorMap.entries()].map(([vendorId, e]) => ({ vendorId, lines: e.lines, valueInr: Math.round(e.valueInr), monthlyTonnes: round2(e.tonnes / 12) }));
  const discountsApplied: ScenarioResult["discountsApplied"] = [];
  for (const t of ctx.terms) {
    const bv = byVendor.find((b) => b.vendorId === t.vendorId);
    if (!bv) continue;
    for (const d of t.discounts) {
      const m = d.condition.match(/(\d+(?:\.\d+)?)\s*(mt|tonne|ton)/i);
      const threshold = m ? parseFloat(m[1]) : null;
      const met = threshold == null ? false : bv.monthlyTonnes > threshold;
      discountsApplied.push({ vendorId: t.vendorId, percent: d.percent, condition: d.condition, met, monthlyTonnes: bv.monthlyTonnes, savingInr: met ? Math.round((bv.valueInr * d.percent) / 100) : 0 });
    }
  }
  const total = lines.reduce((t, x) => t + (x.annualValue ?? 0), 0);
  const saving = discountsApplied.reduce((s, d) => s + d.savingInr, 0);
  return { byVendor, discountsApplied, total, after: total - saving };
}

/** Best award using at most k vendors: exhaustive over vendor subsets (5 vendors → tiny search), each subset
 * capacity-checked within itself, compared AFTER conditional discounts. Feasible subsets beat short ones. */
function bestSubset(rule: ScenarioRule, ctx: Ctx, vendors: string[], k: number, overrides?: Map<string, number>): { lines: AwardLine[]; notes: string[] } {
  const subsets: string[][] = [];
  const rec = (start: number, cur: string[]) => {
    if (cur.length) subsets.push([...cur]);
    if (cur.length === k) return;
    for (let i = start; i < vendors.length; i++) rec(i + 1, [...cur, vendors[i]]);
  };
  rec(0, []);
  let best: { lines: AwardLine[]; notes: string[]; feasible: boolean; covered: number; total: number } | null = null;
  for (const sub of subsets) {
    const cap = enforceCapacity(assign(rule, ctx, sub, overrides), rule, ctx, sub, overrides);
    const feasible = !cap.notes.some((n) => n.includes("award is short"));
    const covered = cap.lines.filter((x) => x.vendorId).length;
    const total = discountsFor(cap.lines, ctx).after;
    const better = !best
      || (feasible && !best.feasible)
      || (feasible === best.feasible && (covered > best.covered || (covered === best.covered && total < best.total)));
    if (better) best = { lines: cap.lines, notes: cap.notes, feasible, covered, total };
  }
  return { lines: best!.lines, notes: best!.notes };
}

/** Audit F06/F21: no vendor may be awarded more tonnes/month than its capacity allows. Moves the lines that
 * cost least to move (smallest regret) to the next-cheapest vendor with room. */
function enforceCapacity(lines: AwardLine[], rule: ScenarioRule, ctx: Ctx, vendors: string[], overrides?: Map<string, number>): { lines: AwardLine[]; notes: string[] } {
  const notes: string[] = [];
  if (!ctx.capacity) return { lines, notes };
  const basis = rule.basis ?? "landed";
  const kg = (id: string) => pieceWeightGrams(ctx.lines.find((l) => l.id === id)!) / 1000;
  const tpm = (a: AwardLine) => (kg(a.lineId) * a.annualQty) / 1000 / 12;
  const load = (v: string, ls: AwardLine[]) => ls.filter((a) => a.vendorId === v).reduce((t, a) => t + tpm(a), 0);
  const priceFor = (v: string, lineId: string) => {
    const c = ctx.cells.find((x) => x.vendorId === v && x.lineId === lineId && x.inrPerPiece != null && x.status !== "missing");
    if (!c) return null;
    const p = overrides?.get(`${v}|${lineId}`) ?? priceOf(c, basis);
    return p != null && Number.isFinite(p) ? p : null;
  };
  const out = lines.map((a) => ({ ...a }));
  for (let guard = 0; guard < 60; guard++) {
    const over = vendors.find((v) => ctx.capacity![v] != null && load(v, out) > (ctx.capacity![v] as number) + 1e-9);
    if (!over) break;
    let best: { i: number; to: string; p: number; regret: number } | null = null;
    out.forEach((a, i) => {
      if (a.vendorId !== over || a.unitPrice == null) return;
      for (const v of vendors) {
        if (v === over) continue;
        const p = priceFor(v, a.lineId);
        if (p == null) continue;
        const room = ctx.capacity![v] == null ? Infinity : (ctx.capacity![v] as number) - load(v, out);
        if (room < tpm(a)) continue;
        const regret = (p - a.unitPrice) * a.annualQty;
        if (!best || regret < best.regret) best = { i, to: v, p, regret };
      }
    });
    if (!best) { notes.push(`${over} would exceed its capacity (${ctx.capacity![over]} t/month awardable) and no other vendor in scope has room: award is short`); break; }
    const b: { i: number; to: string; p: number; regret: number } = best;
    const a = out[b.i];
    notes.push(`${a.lineId} moved from ${over} to ${b.to}: ${over}'s spare capacity allows ${ctx.capacity![over]} t/month (costs ₹${Math.round(b.regret).toLocaleString("en-IN")} a year more)`);
    out[b.i] = { ...a, vendorId: b.to, unitPrice: round2(b.p), annualValue: Math.round(b.p * a.annualQty), unconfirmed: false };
  }
  for (const v of vendors) if (ctx.capacity[v] == null && out.some((a) => a.vendorId === v)) notes.push(`${v}'s capacity is unknown (not stated): its share is unverified`);
  return { lines: out, notes };
}

export function runScenario(rule: ScenarioRule, ctx: Ctx, overrides?: Map<string, number>): ScenarioResult {
  const { ok, excluded } = vendorsFor(rule, ctx);
  let cap: { lines: AwardLine[]; notes: string[] };
  if (rule.rule === "single_vendor" && rule.vendorId) {
    const only = ok.filter((v) => v === rule.vendorId);
    cap = enforceCapacity(assign(rule, ctx, only, overrides), rule, ctx, only, overrides);
  } else if (rule.rule === "max_vendors") cap = bestSubset(rule, ctx, ok, Math.max(1, rule.maxVendors ?? 2), overrides);
  else cap = enforceCapacity(assign(rule, ctx, ok, overrides), rule, ctx, ok, overrides);
  const lines = cap.lines;
  const { byVendor, discountsApplied, total, after } = discountsFor(lines, ctx);

  // Last year, same covered lines (where any vendor has history), as a reference point.
  let ly = 0, lyLines = 0;
  for (const a of lines) {
    if (!a.vendorId) continue;
    const h = ctx.history.filter((x) => x.lineId === a.lineId);
    if (!h.length) continue;
    ly += Math.min(...h.map((x) => x.inrPerPiece)) * a.annualQty; lyLines++;
  }

  const assumptions = [
    `Ranking on ${rule.basis === "quoted" ? "quoted price" : "landed cost (price + freight + tooling, ex-GST)"}`,
    "Missing quotes are never treated as zero; uncovered lines are listed separately",
    ...(ctx.terms.some((t) => t.freight.kind === "extra_unknown") ? ["Where freight is extra with no amount, the midpoint of your lane estimate is used"] : []),
  ];
  return {
    rule, vendorsConsidered: ok, vendorsExcluded: excluded, lines,
    uncoveredLines: lines.filter((a) => !a.vendorId).map((a) => a.lineId),
    totalInr: Math.round(total), discountsApplied, totalAfterDiscountsInr: Math.round(after), byVendor,
    lastYearSameLinesInr: lyLines ? Math.round(ly) : null,
    unconfirmedCellsUsed: lines.filter((a) => a.unconfirmed).length,
    assumptions,
    capacityNotes: cap.notes,
    moqNotes: lines.flatMap((a) => {
      const t = ctx.terms.find((x) => x.vendorId === a.vendorId);
      const monthly = Math.round(a.annualQty / 12);
      if (!a.vendorId || !t?.moqPcs || monthly >= t.moqPcs) return [];
      // An MOQ above the whole year's quantity can't be met by ordering less often: it's a blocker.
      if (t.moqPcs > a.annualQty) return [`BLOCKER ${a.lineId}: ${a.vendorId}'s MOQ of ${t.moqPcs.toLocaleString("en-IN")} pcs exceeds the annual need of ${a.annualQty.toLocaleString("en-IN")}; negotiate the MOQ or award elsewhere`];
      return [`${a.lineId}: monthly call-off ${monthly.toLocaleString("en-IN")} pcs is below ${a.vendorId}'s MOQ of ${t.moqPcs.toLocaleString("en-IN")}; order every ${Math.ceil(t.moqPcs / Math.max(1, monthly))} months (more stock held)`];
    }),
  };
}

export interface CriticalCell {
  vendorId: string;
  lineId: string;
  reason: string;
  /** How the plausible range was set (audit F07): explicit, never a silent default. */
  bound: "two_readings" | "unit_basis" | "per_kg_weight" | "last_year" | "freight_range" | "eligibility" | "default_15pct" | "unbounded";
  range: [number, number] | null;
  /** true = could flip a winner; false = can't; null = can't establish (no defensible bound). */
  couldChangeWinner: boolean | null;
  rupeesAtStake: number;
}

/** Plausible range for an uncertain cell, by reason. Unbounded when the reply doesn't let us bound it. */
export function plausibleRange(c: Cell, basis: "landed" | "quoted"): { bound: CriticalCell["bound"]; range: [number, number] | null } {
  const p = priceOf(c, basis) as number;
  const failed = c.checks.filter((k) => !k.ok).map((k) => k.id);
  const pad = (lo: number, hi: number): [number, number] => [round2(Math.min(lo, hi)), round2(Math.max(lo, hi))];
  if (failed.includes("scope")) return { bound: "unbounded", range: null };
  if (failed.includes("spec_deviation")) return { bound: "eligibility", range: null };
  if (c.alternatives?.length) { const all = [p, ...c.alternatives]; return { bound: "two_readings", range: pad(Math.min(...all), Math.max(...all)) }; }
  const basisFlag = c.checks.find((k) => k.id === "magnitude" && !k.ok && /per-(\d+)/.test(k.reason));
  if (basisFlag) { const n = parseInt(basisFlag.reason.match(/per-(\d+)/)![1], 10); return { bound: "unit_basis", range: pad(p / n, p) }; }
  if (c.landedRange && basis === "landed") return { bound: "freight_range", range: c.landedRange };
  if (failed.includes("unit_basis")) return { bound: "per_kg_weight", range: pad(p * 0.9, p * 1.1) };
  if (c.status === "carried") return { bound: "last_year", range: pad(p * 0.9, p * 1.1) };
  return { bound: "default_15pct", range: pad(p * 0.85, p * 1.15) };
}

/**
 * Robustness: push every uncertain in-scope cell to the edges of its plausible range (or exclude it, for
 * eligibility questions) and re-run the WHOLE scenario, discounts included. Cells that could flip the award
 * come first; cells with no defensible bound are "can't establish" and count against the decision holding.
 */
export function robustness(rule: ScenarioRule, ctx: Ctx): { critical: CriticalCell[]; holds: boolean; unknown: number } {
  const basis = rule.basis ?? "landed";
  const base = runScenario(rule, ctx);
  const winners = (r: ScenarioResult) => r.lines.map((a) => a.vendorId ?? "-").join("|");
  const baseW = winners(base);
  const { ok } = vendorsFor(rule, ctx);
  const uncertain = ctx.cells.filter((c) => ok.includes(c.vendorId) && c.inrPerPiece != null && (c.status === "needs_review" || c.status === "carried"));
  const out: CriticalCell[] = [];
  const key = (c: Cell) => `${c.vendorId}|${c.lineId}`;
  for (const c of uncertain) {
    const { bound, range } = plausibleRange(c, basis);
    const qty = ctx.lines.find((l) => l.id === c.lineId)!.annualQty;
    let changes: boolean | null = false;
    if (bound === "eligibility") {
      // If the bid may not meet spec, test the award without it.
      const after = runScenario(rule, ctx, new Map([[key(c), Number.POSITIVE_INFINITY]]));
      changes = winners(after) !== baseW;
    } else if (!range) {
      // No bound: we can only say it matters if it's winning now, or would win at half price.
      const winning = base.lines.find((a) => a.lineId === c.lineId)?.vendorId === c.vendorId;
      const cheap = runScenario(rule, ctx, new Map([[key(c), (priceOf(c, basis) as number) * 0.5]]));
      changes = winning || winners(cheap) !== baseW ? null : false;
    } else {
      for (const probe of range) if (winners(runScenario(rule, ctx, new Map([[key(c), probe]]))) !== baseW) changes = true;
    }
    out.push({ vendorId: c.vendorId, lineId: c.lineId, reason: c.reasons[0] ?? c.status, bound, range, couldChangeWinner: changes, rupeesAtStake: range ? Math.round((range[1] - range[0]) * qty) : 0 });
  }
  const rank = (x: CriticalCell) => (x.couldChangeWinner === true ? 0 : x.couldChangeWinner === null ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || b.rupeesAtStake - a.rupeesAtStake);
  const unknown = out.filter((x) => x.couldChangeWinner === null).length;
  return { critical: out, holds: !out.some((x) => x.couldChangeWinner !== false), unknown };
}
