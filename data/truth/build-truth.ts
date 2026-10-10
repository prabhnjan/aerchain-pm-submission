// Builds the ground truth for the demo: what each of the 5 vendors actually meant.
// Run: npx tsx data/truth/build-truth.ts   → writes data/truth/truth.json
// Deterministic (seeded), so the dataset and the evals are reproducible.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LINES } from "../rfx";
import { pieceWeightGrams, round2, type LineSpec } from "../../lib/domain/spec";
import type { Truth, TruthCell, TruthVendor, Trap, VendorId } from "./types";

// ---------- seeded randomness ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261009);
const noise = (pct: number) => 1 + (rand() * 2 - 1) * pct;

// ---------- market price model (research/domain-corrugated.md §2) ----------
const RS_PER_KG: Record<number, number> = { 3: 56, 5: 54, 7: 55 };
function marketPrice(l: LineSpec): number {
  const perKg = RS_PER_KG[l.ply] + (l.bf >= 22 ? 2 : 0) + (l.bf >= 28 ? 4 : 0);
  const w = pieceWeightGrams(l) / 1000;
  return w * perKg + 0.15 * l.printColours + (l.style.startsWith("Die") ? 1 : 0);
}

const FX = { usdInr: 88.4, date: "2026-09-30", source: "Assumed demo rate, fixed at bid close (not a real RBI reference rate)" };
const byId = Object.fromEntries(LINES.map((l) => [l.id, l]));
const w = (id: string) => pieceWeightGrams(byId[id]) / 1000; // kg

const cells: TruthCell[] = [];
const history: Truth["history"] = [];
const traps: Trap[] = [];

// ---------- Vendor A: Excel, own layout ----------
// Skips 3 die-cut lines (no die-cutting). Pads and partitions priced per 100. One pad has no unit.
const A_SKIP = ["PK-DCT-021", "PK-DCT-022", "PK-DCT-023"];
const A_PER_100 = ["PK-PRT-025", "PK-PRT-026", "PK-PRT-027", "PK-PAD-028", "PK-PAD-029"];
const A_UNIT_UNSTATED = "PK-PAD-028";
for (const l of LINES) {
  if (A_SKIP.includes(l.id)) {
    cells.push({ vendorId: "A", lineId: l.id, state: "missing", inrPerPiece: null, landedPerPiece: null, trapIds: ["T03"] });
    continue;
  }
  const perPiece = round2(marketPrice(l) * noise(0.05));
  const per100 = A_PER_100.includes(l.id);
  const value = per100 ? Math.round(perPiece * 100) : perPiece;
  const stated = l.id !== A_UNIT_UNSTATED;
  cells.push({
    vendorId: "A", lineId: l.id, state: "quoted",
    vendorLineName: l.description,
    native: { value, basis: per100 ? "per_100" : "per_piece", currency: "INR", basisStated: stated },
    asWritten: per100 ? (stated ? `${value} per 100 nos` : `${value}`) : `${value.toFixed(2)}`,
    inrPerPiece: per100 ? value / 100 : value,
    landedPerPiece: per100 ? value / 100 : value,
    trapIds: per100 ? [stated ? "T01" : "T02"] : [],
  });
  history.push({ vendorId: "A", lineId: l.id, inrPerPiece: round2(perPiece * 0.96), ref: "PO-2025-118 (FY 2025-26 contract)" });
}

// ---------- Vendor B: letterhead PDF, prices in USD, 3% discount in a footnote ----------
for (const l of LINES) {
  const inr = marketPrice(l) * 0.98 * noise(0.04);
  const usd = Math.round((inr / FX.usdInr) * 1000) / 1000;
  const inrPerPiece = round2(usd * FX.usdInr);
  cells.push({
    vendorId: "B", lineId: l.id, state: "quoted",
    vendorLineName: l.description,
    native: { value: usd, basis: "per_piece", currency: "USD", basisStated: true },
    asWritten: `USD ${usd.toFixed(3)}`,
    inrPerPiece, landedPerPiece: inrPerPiece,
    trapIds: ["T05"],
  });
}

// ---------- Vendor C: Word doc, commercials in prose ----------
// Ex-works with a stated freight estimate; plate and die charges extra; 2 lines downgraded on GSM; 1 outlier.
const C_FREIGHT = 2.1;
const C_PLATE = 4500;
const C_DIE = 18000;
const C_DEVIATION: Record<string, string> = {
  "PK-SHP-001": "Top and bottom liner 150 GSM instead of 180 GSM",
  "PK-SHP-004": "Top and bottom liner 150 GSM instead of 180 GSM",
};
for (const l of LINES) {
  const outlier = l.id === "PK-SHP-020" ? 1.22 : 1;
  const base = round2(marketPrice(l) * 0.95 * noise(0.05) * outlier);
  const tooling = (l.printColours * C_PLATE + (l.style.startsWith("Die") ? C_DIE : 0)) / l.annualQty;
  const landed = round2(base + w(l.id) * C_FREIGHT + tooling);
  cells.push({
    vendorId: "C", lineId: l.id, state: "quoted",
    vendorLineName: l.description,
    native: { value: base, basis: "per_piece", currency: "INR", basisStated: true },
    asWritten: `Rs. ${base.toFixed(2)}`,
    inrPerPiece: base, landedPerPiece: landed,
    ...(C_DEVIATION[l.id] ? { specDeviation: C_DEVIATION[l.id] } : {}),
    trapIds: ["T07", "T08", ...(C_DEVIATION[l.id] ? ["T09"] : []), ...(outlier > 1 ? ["T21"] : [])],
  });
}

// ---------- Vendor D: angled phone photo of a printed rate card ----------
// Own item names (no codes), 24 of 30 lines, 2 smudged digits.
const D_SKIP = ["PK-DCT-023", "PK-PRT-025", "PK-PRT-026", "PK-PRT-027", "PK-PAD-028", "PK-PAD-029"];
const D_SMUDGED = ["PK-SHP-009", "PK-SHP-014"];
const D_NAMES: Record<string, string> = {
  "PK-SHP-001": "5 Ply Box 410x310x260 (Detergent 1 Kg)",
  "PK-SHP-002": "5 Ply Box 420x300x240 (Detergent 500g)",
  "PK-SHP-003": "5 Ply Box 380x260x180 (Bar Soap)",
  "PK-SHP-004": "5 Ply Box 400x270x230 (Dishwash)",
  "PK-SHP-005": "5 Ply Box 330x250x230 (Oil Pouch)",
  "PK-SHP-006": "7 Ply Box 340x330x310 (Oil Jar 5L)",
  "PK-SHP-007": "3 Ply Box 440x300x250 (Biscuit)",
  "PK-SHP-008": "3 Ply Box 470x330x280 (Biscuit Family)",
  "PK-SHP-009": "3 Ply Box 450x330x300 (Noodles)",
  "PK-SHP-010": "5 Ply Box 400x300x270 (Tea)",
  "PK-SHP-011": "5 Ply Box 360x270x200 (Shampoo Btl)",
  "PK-SHP-012": "3 Ply Box 300x220x180 (Sachet)",
  "PK-SHP-013": "5 Ply Box 420x320x220 (Toothpaste)",
  "PK-SHP-014": "5 Ply Box 400x300x230 (Soap)",
  "PK-SHP-015": "5 Ply Box 350x270x250 (Ketchup)",
  "PK-SHP-016": "3 Ply Box 380x280x200 (Masala)",
  "PK-SHP-017": "5 Ply Box 290x220x250 (Juice 1L)",
  "PK-SHP-018": "3 Ply E-Flute Mailer 300x250x120",
  "PK-SHP-019": "5 Ply Export Box 410x310x260 28BF",
  "PK-SHP-020": "5 Ply Jumbo Box 560x380x300",
  "PK-DCT-021": "Display Tray 400x300x90 4 Clr",
  "PK-DCT-022": "Juice Tray 380x260x70",
  "PK-DCT-024": "Oil Tray 330x250x100",
  "PK-SHP-030": "3 Ply Small Box 250x200x150",
};
for (const l of LINES) {
  if (D_SKIP.includes(l.id)) {
    cells.push({ vendorId: "D", lineId: l.id, state: "missing", inrPerPiece: null, landedPerPiece: null, trapIds: ["T12"] });
    continue;
  }
  const p = round2(marketPrice(l) * 0.94 * noise(0.04));
  cells.push({
    vendorId: "D", lineId: l.id, state: "quoted",
    vendorLineName: D_NAMES[l.id],
    native: { value: p, basis: "per_piece", currency: "INR", basisStated: true },
    asWritten: p.toFixed(2),
    inrPerPiece: p, landedPerPiece: p,
    trapIds: ["T13", ...(D_SMUDGED.includes(l.id) ? ["T11"] : [])],
  });
}

// ---------- Vendor E: one-line email ----------
// "₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra."
// What E meant (confirmed later in the truth): per-kg rates apply to RSC shippers only;
// trays, pads and the 7-ply box are "same as last year". No history = not quoted.
const E_HISTORY: Record<string, number> = {
  "PK-SHP-006": round2(marketPrice(byId["PK-SHP-006"]) * 0.93),
  "PK-DCT-022": round2(marketPrice(byId["PK-DCT-022"]) * 0.93),
  "PK-DCT-024": round2(marketPrice(byId["PK-DCT-024"]) * 0.93),
  "PK-PAD-028": round2(marketPrice(byId["PK-PAD-028"]) * 0.93),
};
const LANE = [1.5, 3.0]; // buyer's own freight estimate range, ₹/kg
for (const l of LINES) {
  const kg = w(l.id);
  if (l.style === "RSC" && (l.ply === 5 || l.ply === 3)) {
    const rate = l.ply === 5 ? 42 : 38;
    const p = round2(kg * rate);
    cells.push({
      vendorId: "E", lineId: l.id, state: "quoted",
      native: { value: rate, basis: "per_kg", currency: "INR", basisStated: true },
      asWritten: l.ply === 5 ? "₹42/kg for the 5-ply" : "38 for the 3-ply",
      inrPerPiece: p, landedPerPiece: null,
      landedRange: [round2(p + kg * LANE[0]), round2(p + kg * LANE[1])],
      specDeviation: "GSM and BF not stated; per-kg rate may assume lighter board than spec",
      trapIds: ["T15", "T17", ...(l.ply === 3 ? [] : [])],
    });
  } else if (E_HISTORY[l.id] !== undefined) {
    const p = E_HISTORY[l.id];
    cells.push({
      vendorId: "E", lineId: l.id, state: "carried",
      asWritten: "rest same as last year",
      inrPerPiece: p, landedPerPiece: null,
      landedRange: [round2(p + kg * LANE[0]), round2(p + kg * LANE[1])],
      trapIds: ["T16", "T17", "T18"],
    });
  } else {
    cells.push({ vendorId: "E", lineId: l.id, state: "missing", asWritten: "rest same as last year", inrPerPiece: null, landedPerPiece: null, trapIds: ["T16", "T18"] });
  }
}
for (const [lineId, p] of Object.entries(E_HISTORY)) history.push({ vendorId: "E", lineId, inrPerPiece: p, ref: "PO-2025-131 (FY 2025-26)" });
// E also supplied RSC lines last year; useful for drift checks.
for (const l of LINES.filter((x) => x.style === "RSC" && x.ply !== 7)) {
  history.push({ vendorId: "E", lineId: l.id, inrPerPiece: round2(marketPrice(l) * 0.9), ref: "PO-2025-131 (FY 2025-26)" });
}

// ---------- Vendors, terms, questionnaire answers ----------
const vendors: TruthVendor[] = [
  {
    id: "A", name: "Sri Venkatesha Corrugators Pvt Ltd", location: "Bommasandra, Bengaluru", format: "xlsx", replyDay: 3,
    terms: { freight: "delivered", paymentDays: 45, validityDays: 30, gstStated: "GST 12% extra", currency: "INR" },
    answers: [
      { questionId: "Q01", answer: "29AAKCS4471M1Z2", pass: true },
      { questionId: "Q02", answer: "Yes, valid till 31-08-2027", pass: true },
      { questionId: "Q03", answer: "Bursting, ECT, GSM, moisture, cobb", pass: true },
      { questionId: "Q04", answer: "Yes", pass: true },
      { questionId: "Q05", answer: "450 t/month, 70% utilised", pass: true, note: "Spare 135 t vs 89 t needed for full volume" },
      { questionId: "Q06", answer: "Automatic 5-ply line", pass: null },
      { questionId: "Q07", answer: "8 days", pass: true },
      { questionId: "Q08", answer: "No", pass: null },
      { questionId: "Q09", answer: "Yes", pass: true },
      { questionId: "Q10", answer: "850", pass: null },
    ],
    clearsQuestionnaire: true,
  },
  {
    id: "B", name: "Kaveri Packtech LLP (export-oriented unit)", location: "Hosur, Tamil Nadu", format: "pdf", replyDay: 5,
    terms: { freight: "delivered", paymentDays: 60, validityDays: 30, gstStated: "GST 5% extra as applicable", discount: { percent: 3, condition: "Monthly offtake above 5 MT", appliesTo: "all" }, currency: "USD" },
    answers: [
      { questionId: "Q01", answer: "33AAJFK2208P1ZB", pass: true },
      { questionId: "Q02", answer: "Yes, valid till 15-01-2028", pass: true },
      { questionId: "Q03", answer: "Full lab: bursting, ECT, BCT, GSM, moisture, cobb", pass: true },
      { questionId: "Q04", answer: "Yes", pass: true },
      { questionId: "Q05", answer: "600 t/month, 65% utilised", pass: true },
      { questionId: "Q06", answer: "Automatic", pass: null },
      { questionId: "Q07", answer: "7 days", pass: true },
      { questionId: "Q08", answer: "Yes", pass: null },
      { questionId: "Q09", answer: "Yes", pass: true },
      { questionId: "Q10", answer: "400", pass: null },
    ],
    clearsQuestionnaire: true,
  },
  {
    id: "C", name: "Meenakshi Box Industries", location: "Peenya, Bengaluru", format: "docx", replyDay: 6,
    terms: { freight: "ex_works_stated", freightInrPerKg: C_FREIGHT, paymentDays: 30, validityDays: 7, gstStated: "GST extra", tooling: { platePerColourInr: C_PLATE, diePerItemInr: C_DIE }, currency: "INR" },
    answers: [
      { questionId: "Q01", answer: "29ABMPM9013K1Z7", pass: true },
      { questionId: "Q02", answer: "Yes, valid till 30-03-2027", pass: true },
      { questionId: "Q03", answer: "GSM and moisture in-house; bursting at outside lab", pass: false },
      { questionId: "Q04", answer: "On request", pass: false },
      { questionId: "Q05", answer: "120 t/month, 85% utilised", pass: false, note: "Spare 18 t" },
      { questionId: "Q06", answer: "Semi-automatic", pass: null },
      { questionId: "Q07", answer: "12 days", pass: false },
      { questionId: "Q08", answer: "No", pass: null },
      { questionId: "Q09", answer: "Yes", pass: true },
      { questionId: "Q10", answer: null, pass: null },
    ],
    clearsQuestionnaire: false,
  },
  {
    id: "D", name: "Shree Ambika Cartons", location: "Dabaspet, Bengaluru Rural", format: "photo", replyDay: 8,
    terms: { freight: "delivered", gstStated: "GST extra", currency: "INR" },
    answers: [
      { questionId: "Q01", answer: "29AGHPA6620R1Z4", pass: true },
      { questionId: "Q02", answer: "Yes (certificate attached)", pass: false, note: "Attached certificate expired 31-03-2026" },
      { questionId: "Q03", answer: "Bursting, GSM, moisture", pass: true },
      { questionId: "Q04", answer: "Yes", pass: true },
      { questionId: "Q05", answer: "300 t/month, 55% utilised", pass: true },
      { questionId: "Q06", answer: "Semi-automatic", pass: null },
      { questionId: "Q07", answer: "10 days", pass: true },
      { questionId: "Q08", answer: "No", pass: null },
      { questionId: "Q09", answer: "Yes", pass: true },
      { questionId: "Q10", answer: null, pass: null },
    ],
    clearsQuestionnaire: false,
  },
  {
    id: "E", name: "Navkar Packaging Solutions", location: "Jigani, Bengaluru", format: "email", replyDay: 9,
    terms: { freight: "ex_works_unknown", currency: "INR" },
    answers: [],
    clearsQuestionnaire: null,
  },
];

// ---------- traps (what the system must catch) ----------
traps.push(
  { id: "T01", vendorId: "A", lineIds: A_PER_100.filter((x) => x !== A_UNIT_UNSTATED), what: "Priced per 100 pieces (unit stated)", expected: "convert_and_show" },
  { id: "T02", vendorId: "A", lineIds: [A_UNIT_UNSTATED], what: "Per-100 price with no unit written (100x the others)", expected: "flag" },
  { id: "T03", vendorId: "A", lineIds: A_SKIP, what: "Quoted 27 of 30 lines", expected: "missing_not_zero" },
  { id: "T04", vendorId: "A", lineIds: [], what: "States GST 12% (stale; boxes are 5% since 22 Sep 2025)", expected: "flag" },
  { id: "T05", vendorId: "B", lineIds: LINES.map((l) => l.id), what: "Quoted in USD", expected: "convert_and_show" },
  { id: "T06", vendorId: "B", lineIds: [], what: "3% discount in a footnote, conditional on monthly offtake above 5 MT", expected: "condition_not_baked_in" },
  { id: "T07", vendorId: "C", lineIds: LINES.map((l) => l.id), what: "Ex-works; freight about ₹2.10/kg stated in prose", expected: "landed_cost" },
  { id: "T08", vendorId: "C", lineIds: LINES.map((l) => l.id), what: "Plate and die charges extra, stated in prose", expected: "landed_cost" },
  { id: "T09", vendorId: "C", lineIds: Object.keys(C_DEVIATION), what: "GSM downgrade vs spec", expected: "flag" },
  { id: "T10", vendorId: "C", lineIds: [], what: "Validity only 7 days", expected: "flag" },
  { id: "T11", vendorId: "D", lineIds: D_SMUDGED, what: "Smudged digit on the photo", expected: "flag" },
  { id: "T12", vendorId: "D", lineIds: D_SKIP, what: "Rate card covers 24 of 30 lines", expected: "missing_not_zero" },
  { id: "T13", vendorId: "D", lineIds: Object.keys(D_NAMES), what: "Own item names, no buyer codes (line matching)", expected: "convert_and_show" },
  { id: "T14", vendorId: "D", lineIds: [], what: "Says ISO certified, attached certificate expired 31-03-2026", expected: "fail_questionnaire" },
  { id: "T15", vendorId: "E", lineIds: LINES.filter((l) => l.style === "RSC" && l.ply !== 7).map((l) => l.id), what: "Per-kg rate; needs box weight from spec", expected: "convert_and_show" },
  { id: "T16", vendorId: "E", lineIds: Object.keys(E_HISTORY), what: "'Rest same as last year'", expected: "carried_and_flag" },
  { id: "T17", vendorId: "E", lineIds: [], what: "Freight extra, amount unknown", expected: "landed_cost" },
  { id: "T18", vendorId: "E", lineIds: LINES.filter((l) => !(l.style === "RSC" && l.ply !== 7)).map((l) => l.id), what: "Ambiguous scope: does '3-ply'/'5-ply' include trays, partitions and pads?", expected: "flag" },
  { id: "T19", vendorId: "E", lineIds: [], what: "Questionnaire not answered", expected: "fail_questionnaire" },
  { id: "T20", vendorId: "C", lineIds: [], what: "Fails must-haves: no in-house bursting test, capacity, lead time", expected: "fail_questionnaire" },
  { id: "T21", vendorId: "C", lineIds: ["PK-SHP-020"], what: "Price 22% above the market for this line", expected: "flag" },
);

const truth: Truth = { generatedAt: new Date().toISOString(), fx: FX, vendors, cells, history, traps };
writeFileSync(join(__dirname, "truth.json"), JSON.stringify(truth, null, 2));
// Reference data the BUYER legitimately has (last year's POs, the FX rate fixed at bid close,
// their own freight lane estimate). The pipeline reads only this, never truth.json.
writeFileSync(
  join(__dirname, "..", "reference.json"),
  JSON.stringify({ fx: FX, freightLaneInrPerKg: LANE, history, gstRateBoxes: 5 }, null, 2),
);

// ---------- summary ----------
const total = (v: VendorId) => cells.filter((c) => c.vendorId === v && c.inrPerPiece != null).reduce((s, c) => s + (c.inrPerPiece as number) * byId[c.lineId].annualQty, 0);
const market = LINES.reduce((s, l) => s + marketPrice(l) * l.annualQty, 0);
console.log(`Market total ₹${(market / 1e7).toFixed(2)} crore`);
for (const v of vendors) {
  const n = cells.filter((c) => c.vendorId === v.id && c.state !== "missing").length;
  console.log(`${v.id} ${v.name.padEnd(42)} lines ${n}/30  total ₹${(total(v.id) / 1e7).toFixed(2)} crore`);
}
console.log(`Cells ${cells.length}, traps ${traps.length}, history rows ${history.length}`);
