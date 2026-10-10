// Stages 3 to 5: normalise claims to INR per piece, run checks, decide each cell's status.
// Pure code, no AI: every number here is reproducible and every flag has a plain-words reason.
import { pieceWeightGrams, round2, type LineSpec } from "@/lib/domain/spec";
import type { Cell, CheckResult, EvidenceDoc, ExtractedCondition } from "./types";
import type { ReplyExtraction } from "@/lib/extract/schema";
import { CORRUGATED as CAT } from "@/config/categories/corrugated";

export interface Reference {
  fx: { usdInr: number; date: string; source: string };
  freightLaneInrPerKg: [number, number];
  history: { vendorId: string; lineId: string; inrPerPiece: number; ref: string }[];
  gstRateBoxes: number;
}

export interface VendorInput {
  vendorId: string;
  docs: EvidenceDoc[];
  extraction: ReplyExtraction;
  secondRead?: ReplyExtraction;
}

export interface VendorTerms {
  vendorId: string;
  freight: { kind: "delivered" | "extra_stated" | "extra_unknown" | "not_stated"; inrPerKg?: number; quote?: string };
  tooling: { platePerColourInr?: number; diePerItemInr?: number; quote?: string };
  discounts: { percent: number; condition: string; quote: string }[];
  paymentDays?: number;
  validityDays?: number;
  gst: { basis: "exclusive" | "inclusive" | "not_stated"; rate?: number; quote?: string };
  moqPcs?: number; // minimum order per item per order (audit F21)
  moqQuote?: string;
  flags: string[]; // vendor-level issues, in plain words
  conditions: ExtractedCondition[];
}

const THRESH = { high: CAT.outlierHigh, low: CAT.outlierLow, driftUp: 0.15, driftDown: -0.1, basisTolerance: 0.25 };

export const norm = (s: string) => s.toLowerCase().replace(/[₹,]/g, "").replace(/\brs\.?/g, "").replace(/\s+/g, " ").trim();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};


// ---- line match (audit F04): a found number must also belong to THIS line ----
const CODE = /PK-[A-Z]{3}-\s*\d{3}/g;
const DIMS = /(\d{2,4}(?:\.\d)?|\d\.\d)["”″]?\s*[x×*]\s*(\d{2,4}(?:\.\d)?|\d\.\d)["”″]?(?:\s*[x×*]\s*(\d{2,4}(?:\.\d)?|\d\.\d))?/gi; // 2+ digits or a decimal (inches); "3x4" partitions are not sizes
const codesIn = (t: string) => [...t.toUpperCase().matchAll(CODE)].map((m) => m[0].replace(/\s+/g, ""));
function dimsMatch(t: string, l: LineSpec): boolean | null {
  const found = [...t.matchAll(DIMS)].map((m) => [m[1], m[2], m[3]].filter(Boolean).map(Number));
  if (!found.length) return null;
  const want = [l.lengthMm, l.widthMm, l.heightMm].filter((n) => n > 0);
  // Vendors write sizes in mm, cm or inches (held-out test, audit F09): accept any consistent unit.
  return found.some((d) => d.length >= 2 && [1, 10, 25.4].some((k) => d.every((n, i) => want[i] !== undefined && Math.abs(n * k - want[i]) <= Math.max(5, k * 0.6))));
}
/** ok / not ok with a reason, or null when there's nothing to check against (no codes or sizes near the price). */
export function lineMatch(x: { source_quote: string; vendor_item_text: string; price_text: string; price_value: number }, l: LineSpec, evidence: string): { ok: boolean; reason: string } | null {
  const own = `${x.vendor_item_text} ${x.source_quote}`;
  const ownCodes = codesIn(own);
  if (ownCodes.length) return ownCodes.includes(l.id) ? { ok: true, reason: "" } : { ok: false, reason: `The vendor's text names ${ownCodes[0]}, not ${l.id}` };
  const dm = dimsMatch(own, l);
  if (dm === false) return { ok: false, reason: `The vendor's item size doesn't match ${l.id}'s ${l.lengthMm}x${l.widthMm}${l.heightMm ? "x" + l.heightMm : ""} mm` };
  if (dm === true) return { ok: true, reason: "" };
  // Otherwise look at what sits next to the price in the reply itself.
  const tokens = [x.price_text.replace(/[^\d.]/g, ""), x.price_value.toFixed(2), x.price_value.toFixed(3), String(x.price_value)].filter((t) => t && t !== "-1" && t !== ".");
  const rows = evidence.split("\n");
  const near: string[][] = [];
  rows.forEach((r, i) => {
    if (!tokens.some((t) => new RegExp(`(^|[^\\d.])${t.replace(".", "\\.")}([^\\d]|$)`).test(r))) return;
    const sameRow = codesIn(r); // spreadsheet rows and table lines: the price's own row wins
    if (sameRow.length) { near.push(sameRow); return; }
    const rowDims = dimsMatch(r.replace(/["”″]/g, ""), l); // a row with its own size is judged on that size (held-out G)
    if (rowDims === true) { near.push([l.id]); return; }
    if (rowDims === false) { near.push(["(a different size)"]); return; }
    // Spreadsheet rows are self-contained (held-out H): sizes may sit in separate cells (L | W | H), and
    // neighbouring rows' codes say nothing about this row.
    if (/^\[.+ row \d+\]/.test(r)) {
      const cellsNums = [...r.matchAll(/=(\d{2,4})(?=\s*(\||$))/g)].map((m) => +m[1]);
      const want = [l.lengthMm, l.widthMm, l.heightMm].filter((n) => n > 0);
      if (want.every((w) => cellsNums.some((n) => Math.abs(n - w) <= 5))) near.push([l.id]);
      return;
    }
    near.push(codesIn(rows.slice(Math.max(0, i - 3), i + 1).join(" ")));
  });
  if (!near.length || near.every((c) => !c.length)) return null;
  if (near.some((c) => c.includes(l.id))) return { ok: true, reason: "" };
  const other = near.find((c) => c.length)![0];
  return { ok: false, reason: other.startsWith("(") ? `In the reply, this price's row gives a different size from ${l.id}` : `In the reply, this price sits next to ${other}, not ${l.id}` };
}

export function readTerms(v: VendorInput, ref: Reference): VendorTerms {
  const t: VendorTerms = { vendorId: v.vendorId, freight: { kind: "not_stated" }, tooling: {}, discounts: [], gst: { basis: "not_stated" }, flags: [], conditions: v.extraction.conditions };
  for (const c of v.extraction.conditions) {
    // Freight: the reader classifies it (a reading job); code only applies the label.
    if (c.freight_basis === "extra_amount_stated" && c.amount_inr > 0 && c.amount_basis === "per_kg") {
      t.freight = { kind: "extra_stated", inrPerKg: c.amount_inr, quote: c.source_quote };
    } else if (c.freight_basis === "extra_amount_unknown" && t.freight.kind !== "extra_stated") {
      t.freight = { kind: "extra_unknown", quote: c.source_quote };
    } else if (c.freight_basis === "delivered_included" && t.freight.kind === "not_stated") {
      t.freight = { kind: "delivered", quote: c.source_quote };
    }
    if (c.kind === "tooling" && c.amount_inr > 0) {
      if (c.amount_basis === "per_colour") t.tooling.platePerColourInr = c.amount_inr;
      if (c.amount_basis === "per_item") t.tooling.diePerItemInr = c.amount_inr;
      t.tooling.quote = c.source_quote;
    }
    // MOQ: only from a term that explicitly says MOQ / minimum order (narrow, unambiguous wording).
    const moq = `${c.source_quote} ${c.summary}`.match(/(?:\bMOQ\b|minimum order(?: quantity)?)\D{0,25}?(\d[\d,]*)\s*(?:pcs|pieces|nos|boxes|units)?/i);
    if (moq) { t.moqPcs = parseInt(moq[1].replace(/,/g, ""), 10); t.moqQuote = c.source_quote; }
    if (c.kind === "discount" && c.percent > 0) t.discounts.push({ percent: c.percent, condition: c.condition, quote: c.source_quote });
    if (c.kind === "payment" && c.days > 0) t.paymentDays = c.days;
    if (c.kind === "validity" && c.days > 0) t.validityDays = c.days;
    // GST basis (held-out G, a silent error before this): inclusive prices must come off GST to compare ex-GST.
    if (c.gst_basis === "prices_include_gst") t.gst = { basis: "inclusive", rate: c.percent > 0 ? c.percent : undefined, quote: c.source_quote };
    else if (c.gst_basis === "prices_exclude_gst" && t.gst.basis === "not_stated") t.gst = { basis: "exclusive", rate: c.percent > 0 ? c.percent : undefined, quote: c.source_quote };
    if (c.kind === "gst" && c.percent > 0 && c.percent !== ref.gstRateBoxes) {
      t.flags.push(`States GST ${c.percent}%. Corrugated boxes are ${ref.gstRateBoxes}% since 22 Sep 2025, so the quote may be stale. Prices compared ex-GST.`);
    }
  }
  if (t.validityDays !== undefined && t.validityDays < 15) t.flags.push(`Prices valid only ${t.validityDays} days: award quickly or the price may move.`);
  if (t.freight.kind === "extra_unknown") t.flags.push("Freight is extra but no amount is given. Landed cost shown as a range using your lane estimate.");
  if (t.moqPcs) t.flags.push(`MOQ ${t.moqPcs.toLocaleString("en-IN")} pieces per order per item: lines with smaller monthly call-offs need less frequent orders (shown in the award).`);
  if (t.freight.kind === "not_stated") t.flags.push("Freight terms not stated. Assumed delivered; confirm with the vendor.");
  if (t.gst.basis === "inclusive") t.flags.push(`Prices are quoted inclusive of GST${t.gst.rate ? ` at ${t.gst.rate}%` : ""}; converted to ex-GST for a fair comparison.`);
  if (t.gst.basis === "not_stated") t.flags.push("GST treatment not stated: prices assumed ex-GST. If they include GST, they're about 5% lower than shown; confirm with the vendor.");
  for (const d of t.discounts) t.flags.push(`Conditional discount ${d.percent}%${d.condition ? ` (${d.condition})` : ""}. Not baked into prices; applied only in scenarios where the condition is met.`);
  return t;
}

export function buildCells(vendors: VendorInput[], lines: LineSpec[], ref: Reference): { cells: Cell[]; terms: VendorTerms[] } {
  const terms = vendors.map((v) => readTerms(v, ref));
  const cells: Cell[] = [];

  for (const v of vendors) {
    const vt = terms.find((t) => t.vendorId === v.vendorId)!;
    const textEvidence = norm(v.docs.map((d) => d.text).join("\n"));
    const hasCheckableText = v.docs.some((d) => d.kind !== "image" && !d.needsSecondRead && d.text.length > 50);
    const hasImage = v.docs.some((d) => d.kind === "image" || d.needsSecondRead);
    const cellMap = Object.assign({}, ...v.docs.map((d) => d.cellMap ?? {}));

    for (const l of lines) {
      const x = v.extraction.lines.find((e) => e.rfx_line_id === l.id);
      const kg = pieceWeightGrams(l) / 1000;
      const base: Cell = {
        vendorId: v.vendorId, lineId: l.id, status: "missing", inrPerPiece: null, landedPerPiece: null,
        conversion: [], checks: [], reasons: [],
        source: {
          file: v.docs.map((d) => d.fileName).join(", "), ref: x?.source_ref ?? "", quote: x?.source_quote ?? "", asWritten: x?.price_text ?? "",
          ...(x && (x.photo_row_top ?? -1) >= 0 && (x.photo_row_bottom ?? -1) > (x.photo_row_top ?? 0) ? { photoBand: [x.photo_row_top as number, x.photo_row_bottom as number] as [number, number] } : {}),
        },
      };

      if (!x || x.price_status === "not_quoted" || (x.price_value < 0 && x.price_status !== "refers_to_history")) {
        base.reasons.push("Not quoted");
        cells.push(base);
        continue;
      }

      let value: number;
      if (x.price_status === "refers_to_history") {
        const h = ref.history.find((r) => r.vendorId === v.vendorId && r.lineId === l.id);
        if (!h) {
          base.reasons.push(`Vendor said "${x.source_quote || "same as last year"}" but there's no last-year price for this line`);
          cells.push(base);
          continue;
        }
        value = h.inrPerPiece;
        base.status = "carried";
        base.conversion.push(`Last year's price from ${h.ref}`);
      } else {
        value = x.price_value;
        if (x.currency === "USD") {
          base.conversion.push(`USD ${value} × ${ref.fx.usdInr} (${ref.fx.date})`);
          value *= ref.fx.usdInr;
        }
        if (vt.gst.basis === "inclusive") {
          const rate = vt.gst.rate ?? ref.gstRateBoxes;
          base.conversion.push(`÷ ${(1 + rate / 100).toFixed(2)} (quoted inclusive of ${rate}% GST)`);
          value /= 1 + rate / 100;
        }
        if (x.unit_basis === "per_100") { base.conversion.push(`÷ 100 (quoted per 100)`); value /= 100; }
        if (x.unit_basis === "per_1000") { base.conversion.push(`÷ 1000 (quoted per 1000)`); value /= 1000; }
        if (x.unit_basis === "per_kg") {
          base.conversion.push(`₹${round2(value)}/kg × ${Math.round(kg * 1000)} g box weight (modelled from your spec's size, ply and GSM; not a weighed sample)`);
          value *= kg;
        }
      }
      base.inrPerPiece = round2(value);

      // landed cost
      const tooling = ((vt.tooling.platePerColourInr ?? 0) * l.printColours + (l.style.startsWith("Die") ? vt.tooling.diePerItemInr ?? 0 : 0)) / l.annualQty;
      if (vt.freight.kind === "extra_unknown") {
        const [lo, hi] = ref.freightLaneInrPerKg;
        base.landedRange = [round2(value + tooling + kg * lo), round2(value + tooling + kg * hi)];
      } else {
        const freight = vt.freight.kind === "extra_stated" ? kg * (vt.freight.inrPerKg ?? 0) : 0;
        base.landedPerPiece = round2(value + freight + tooling);
      }

      // ---- checks ----
      const checks: CheckResult[] = [];
      if (base.status === "carried") {
        checks.push({ id: "carried", ok: false, reason: `Filled from last year's price ("${x.source_quote || x.price_text}"). Confirm it still stands.` });
      } else {
        if (hasCheckableText && x.source_quote) {
          const found = textEvidence.includes(norm(x.source_quote)) || textEvidence.includes(norm(x.price_text));
          // A vendor who also sent a photo: the price may live only in the image, where the second read checks it.
          if (found || !hasImage) checks.push({ id: "grounded", ok: found, reason: found ? "" : "The quoted text wasn't found in the reply" });
        }
        const addr = x.source_ref.match(/([^!\s]+)!([A-Z]+\d+)/);
        if (addr && cellMap[`${addr[1]}!${addr[2]}`] !== undefined) {
          const cellVal = parseFloat(String(cellMap[`${addr[1]}!${addr[2]}`]).replace(/[^\d.-]/g, ""));
          const ok = Math.abs(cellVal - x.price_value) < 0.005;
          checks.push({ id: "cell_address", ok, reason: ok ? "" : `Cell ${addr[2]} holds ${cellVal}, not ${x.price_value}` });
        }
        if (hasImage && !v.secondRead) {
          checks.push({ id: "second_read", ok: false, reason: "Read from a photo, and the independent second read is unavailable. Check against the image." });
        }
        if (v.secondRead) {
          const y = v.secondRead.lines.find((e) => e.rfx_line_id === l.id);
          // (Tried and removed: comparing the two reads' row positions. The auditor reads overlapping crops, so
          // its positions are crop-relative and not comparable; it produced 2 false alarms in eval 1.)
          const ok = !!y && y.price_value >= 0 && Math.abs(y.price_value - x.price_value) < 0.005;
          if (!ok && y && y.price_value >= 0) {
            // Keep the other reading as a candidate value (same unit/currency as the first read).
            const ratio = value / x.price_value;
            base.alternatives = [round2(y.price_value * (Number.isFinite(ratio) ? ratio : 1))];
          }
          checks.push({ id: "second_read", ok, reason: ok ? "" : `Two independent reads disagree: ${x.price_text || x.price_value} vs ${y && y.price_value >= 0 ? y.price_text || y.price_value : "nothing"}` });
        }
        // Audit F15: the recorded number must appear in the vendor text the reader quoted for it.
        // Catches a reader attaching a neighbouring row's price, even when a second read agrees.
        const quoteNums = [...(x.source_quote || "").replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
        if (quoteNums.length) {
          const ok = quoteNums.some((n) => Math.abs(n - x.price_value) < 0.005);
          checks.push({ id: "quote_value", ok, reason: ok ? "" : `The quoted text says "${x.source_quote}", but the recorded price is ${x.price_value}` });
        }
        if (x.scope === "explicit_line") {
          const lm = lineMatch(x, l, v.docs.map((d) => d.text).join("\n"));
          if (lm) checks.push({ id: "line_match", ok: lm.ok, reason: lm.reason });
        }
        // Third, non-AI reader for photos (audit F15): an exact OCR match adds evidence and a pixel box.
        const ocr = v.docs.flatMap((d) => d.ocr ?? []);
        if (ocr.length) {
          const hit = ocr.filter((o) => Math.abs(o.value - x.price_value) < 0.005).sort((a, b) => {
            const mid = x.photo_row_top != null && x.photo_row_top >= 0 ? (x.photo_row_top + (x.photo_row_bottom ?? x.photo_row_top)) / 2 : 0.5;
            return Math.abs((a.box[1] + a.box[3]) / 2 - mid) - Math.abs((b.box[1] + b.box[3]) / 2 - mid);
          })[0];
          if (hit) {
            checks.push({ id: "ocr", ok: true, reason: "" });
            base.source.pixelBox = hit.box;
          }
        }
        if (x.price_status === "partly_illegible" || x.price_status === "ambiguous") {
          checks.push({ id: "legibility", ok: false, reason: `Hard to read: "${x.price_text}"` });
        }
        if (x.scope === "group_statement_uncertain") {
          checks.push({ id: "scope", ok: false, reason: `Rate given for a group ("${x.source_quote}"); not certain it covers this line` });
        }
        if (x.unit_inferred) {
          checks.push({ id: "unit_basis", ok: false, reason: `Unit not written next to the price; taken from the same sentence ("${x.source_quote}")` });
        }
        if (x.unit_basis === "per_kg") {
          checks.push({ id: "unit_basis", ok: false, reason: "Quoted per kg; converted using your spec's box weight, which assumes the vendor's board matches spec" });
        }
        if (vt.gst.basis === "inclusive" && vt.gst.rate === undefined) {
          checks.push({ id: "unit_basis", ok: false, reason: `Quoted inclusive of GST but the rate isn't stated; ${ref.gstRateBoxes}% assumed` });
        }
        const h = ref.history.find((r) => r.vendorId === v.vendorId && r.lineId === l.id);
        if (h) {
          const drift = value / h.inrPerPiece - 1;
          const ok = drift <= THRESH.driftUp && drift >= THRESH.driftDown;
          checks.push({ id: "history_drift", ok, reason: ok ? "" : `${drift > 0 ? "+" : ""}${Math.round(drift * 100)}% vs this vendor's last-year price (₹${h.inrPerPiece})` });
        }
      }
      if (x.spec_deviation) checks.push({ id: "spec_deviation", ok: false, reason: `Spec deviation: ${x.spec_deviation}` });
      base.checks = checks;
      cells.push(base);
    }
  }

  // ---- magnitude: physical plausibility (₹/kg from the spec's box weight) + cross-vendor outlier ----
  const kgOf = (lineId: string) => pieceWeightGrams(lines.find((l) => l.id === lineId)!) / 1000;
  const perKg = (c: Cell) => (c.inrPerPiece as number) / kgOf(c.lineId);
  const [lo, hi] = CAT.plausibleInrPerKg;
  const plausible = (c: Cell) => c.inrPerPiece != null && perKg(c) >= lo && perKg(c) <= hi && !c.checks.some((k) => k.id === "scope" && !k.ok);
  for (const c of cells) {
    if (c.inrPerPiece == null || c.status === "carried") continue;
    const rate = perKg(c);
    if (rate < lo || rate > hi) {
      const r = rate / CAT.typicalInrPerKg;
      const p = [10, 100, 1000].find((n) => Math.abs(r / n - 1) < THRESH.basisTolerance || Math.abs(r * n - 1) < THRESH.basisTolerance);
      c.checks.push({
        id: "magnitude", ok: false,
        reason: p
          ? `Works out to ₹${Math.round(rate)}/kg, about ${r > 1 ? p + "×" : "1/" + p} a normal box price: looks like a per-${p} price read as per piece`
          : `Works out to ₹${Math.round(rate)}/kg for this box; plausible range is ₹${lo}–${hi}/kg`,
      });
      continue;
    }
    const others = cells.filter((o) => o.lineId === c.lineId && o.vendorId !== c.vendorId && o.status !== "carried" && plausible(o)).map((o) => o.inrPerPiece as number);
    if (others.length < 2) { c.checks.push({ id: "magnitude", ok: true, reason: "" }); continue; }
    const r = c.inrPerPiece / median(others);
    const ok = r <= THRESH.high && r >= THRESH.low;
    c.checks.push({ id: "magnitude", ok, reason: ok ? "" : `${Math.round(Math.abs(r - 1) * 100)}% ${r > 1 ? "above" : "below"} the other vendors' median (₹${round2(median(others))})` });
  }

  // ---- status ----
  for (const c of cells) {
    if (c.status === "missing" && c.inrPerPiece == null) continue;
    c.reasons = c.checks.filter((k) => !k.ok).map((k) => k.reason);
    if (c.status === "carried") continue;
    c.status = c.reasons.length ? "needs_review" : c.conversion.length ? "converted" : "verified";
  }
  return { cells, terms };
}
