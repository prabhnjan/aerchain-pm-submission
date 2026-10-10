// The demo RFx: what the buyer asked for. Fabricated, based on research/domain-corrugated.md.
// In the live app this is what the co-pilot drafts; it's also the seed.
import type { LineSpec } from "@/lib/domain/spec";

export const BUYER = {
  company: "Warner Logistics",
  plant: "Hosur plant, Tamil Nadu",
  buyer: "Category buyer, Packaging",
  rfxId: "RFQ-PKG-2026-014",
  title: "Annual Contract: Corrugated Packaging, FY 2026-27",
  issued: "2026-09-21",
  replyBy: "2026-09-30",
  currency: "INR",
};

type Row = [string, string, LineSpec["style"], number, number, number, 3 | 5 | 7, string, number, number[], number, number];

// id, description, style, L, W, H (inner mm), ply, flutes, BF, GSM layers (top first), print colours, annual qty
const ROWS: Row[] = [
  ["PK-SHP-001", "Shipper, detergent powder 1kg x 12", "RSC", 410, 310, 260, 5, "BC", 22, [180, 150, 150, 150, 180], 2, 80000],
  ["PK-SHP-002", "Shipper, detergent powder 500g x 24", "RSC", 420, 300, 240, 5, "BC", 20, [180, 140, 140, 140, 180], 2, 70000],
  ["PK-SHP-003", "Shipper, detergent bar 150g x 72", "RSC", 380, 260, 180, 5, "BC", 20, [150, 120, 120, 120, 150], 1, 65000],
  ["PK-SHP-004", "Shipper, dishwash liquid 500ml x 24", "RSC", 400, 270, 230, 5, "BC", 22, [180, 150, 150, 150, 180], 2, 50000],
  ["PK-SHP-005", "Shipper, edible oil 1L pouch x 12", "RSC", 330, 250, 230, 5, "BC", 22, [180, 150, 150, 150, 180], 1, 90000],
  ["PK-SHP-006", "Shipper, edible oil 5L jar x 4", "RSC", 340, 330, 310, 7, "BCB", 22, [200, 150, 150, 150, 150, 150, 200], 2, 25000],
  ["PK-SHP-007", "Shipper, biscuits 100g x 48", "RSC", 440, 300, 250, 3, "B", 18, [150, 120, 150], 2, 145000],
  ["PK-SHP-008", "Shipper, biscuits family pack x 24", "RSC", 470, 330, 280, 3, "C", 18, [150, 120, 150], 2, 75000],
  ["PK-SHP-009", "Shipper, noodles 70g x 96", "RSC", 450, 330, 300, 3, "C", 18, [150, 120, 150], 1, 120000],
  ["PK-SHP-010", "Shipper, tea 250g carton x 40", "RSC", 400, 300, 270, 5, "BC", 18, [150, 120, 120, 120, 150], 2, 40000],
  ["PK-SHP-011", "Shipper, shampoo 180ml bottle x 36", "RSC", 360, 270, 200, 5, "BC", 20, [150, 120, 120, 120, 150], 2, 55000],
  ["PK-SHP-012", "Shipper, shampoo sachet strips x 20", "RSC", 300, 220, 180, 3, "B", 16, [140, 120, 140], 1, 80000],
  ["PK-SHP-013", "Shipper, toothpaste 150g x 72", "RSC", 420, 320, 220, 5, "BC", 18, [150, 120, 120, 120, 150], 2, 45000],
  ["PK-SHP-014", "Shipper, soap 100g x 144", "RSC", 400, 300, 230, 5, "BC", 20, [150, 120, 120, 120, 150], 1, 60000],
  ["PK-SHP-015", "Shipper, ketchup 1kg bottle x 12", "RSC", 350, 270, 250, 5, "BC", 22, [180, 150, 150, 150, 180], 2, 30000],
  ["PK-SHP-016", "Shipper, spice powder 100g x 60", "RSC", 380, 280, 200, 3, "B", 18, [150, 120, 150], 1, 50000],
  ["PK-SHP-017", "Shipper, juice 1L carton x 12", "RSC", 290, 220, 250, 5, "BC", 22, [180, 150, 150, 150, 180], 2, 65000],
  ["PK-SHP-018", "E-com mailer, 3 SKU combo", "RSC", 300, 250, 120, 3, "E", 16, [150, 120, 150], 4, 40000],
  ["PK-SHP-019", "Export shipper, detergent 1kg x 12 (high BCT)", "RSC", 410, 310, 260, 5, "BC", 28, [200, 180, 180, 180, 200], 2, 20000],
  ["PK-SHP-020", "Club-store multipack shipper", "RSC", 560, 380, 300, 5, "BC", 22, [180, 150, 150, 150, 180], 2, 15000],
  ["PK-DCT-021", "Die-cut display tray, biscuits (PDQ)", "Die-cut tray", 400, 300, 90, 3, "B", 18, [150, 120, 150], 4, 25000],
  ["PK-DCT-022", "Shrink-wrap tray, juice 200ml x 27", "Die-cut tray", 380, 260, 70, 3, "B", 16, [140, 120, 140], 1, 70000],
  ["PK-DCT-023", "Crash-lock gift box", "Die-cut", 280, 200, 90, 3, "E", 18, [200, 120, 150], 4, 20000],
  ["PK-DCT-024", "Wrap-around tray, oil 1L x 12", "Die-cut tray", 330, 250, 100, 3, "B", 18, [150, 120, 150], 1, 35000],
  ["PK-PRT-025", "Partition set 3x4, ketchup bottles", "Partition", 340, 260, 240, 3, "B", 16, [120, 100, 120], 0, 30000],
  ["PK-PRT-026", "Partition set 2x2, oil jar 5L", "Partition", 330, 320, 290, 3, "B", 16, [120, 100, 120], 0, 25000],
  ["PK-PRT-027", "Partition set 4x6, shampoo bottles", "Partition", 350, 260, 190, 3, "B", 16, [120, 100, 120], 0, 55000],
  ["PK-PAD-028", "Layer pad 400x300, biscuits shipper", "Pad", 400, 300, 0, 3, "B", 16, [120, 100, 120], 0, 135000],
  ["PK-PAD-029", "Pallet tier sheet 1200x1000", "Pad", 1200, 1000, 0, 5, "BC", 18, [150, 120, 120, 120, 150], 0, 10000],
  ["PK-SHP-030", "Trade-promo sample carton", "RSC", 250, 200, 150, 3, "B", 16, [140, 120, 140], 2, 30000],
];

// Lines that pack food (oil, biscuits, noodles, tea, ketchup, spices, juice): food-safe inks required.
const FOOD = new Set(["PK-SHP-005", "PK-SHP-006", "PK-SHP-007", "PK-SHP-008", "PK-SHP-009", "PK-SHP-010", "PK-SHP-015", "PK-SHP-016", "PK-SHP-017", "PK-DCT-021", "PK-DCT-022", "PK-DCT-024", "PK-PRT-025", "PK-PRT-026", "PK-PAD-028"]);

const PARTITION_CELLS: Record<string, [number, number]> = {
  "PK-PRT-025": [3, 4],
  "PK-PRT-026": [2, 2],
  "PK-PRT-027": [4, 6],
};

export const LINES: LineSpec[] = ROWS.map(
  ([id, description, style, lengthMm, widthMm, heightMm, ply, flutes, bf, gsmLayers, printColours, annualQty]) => ({
    id, description, style, lengthMm, widthMm, heightMm, ply, flutes, bf, gsmLayers, printColours, annualQty,
    ...(PARTITION_CELLS[id] ? { partitionCells: PARTITION_CELLS[id] } : {}),
    ...(FOOD.has(id) ? { foodContact: true } : {}),
  }),
);

export interface Question {
  id: string;
  text: string;
  answerType: "text" | "yes_no" | "number" | "choice" | "checklist";
  mustHave: boolean;
  passRule?: string; // plain-language rule the buyer set
  appliesTo?: "food_lines" | "awarded_volume"; // scoped must-have (audit F06); absent = vendor-wide
}

export const QUESTIONNAIRE: Question[] = [
  { id: "Q01", text: "Valid GSTIN and PAN", answerType: "text", mustHave: true, passRule: "GSTIN provided" },
  { id: "Q02", text: "ISO 9001:2015 certified? Certificate expiry date", answerType: "yes_no", mustHave: true, passRule: "Yes, with a certificate valid on the award date" },
  { id: "Q03", text: "In-house lab tests: bursting strength, ECT, BCT, GSM, moisture, cobb", answerType: "checklist", mustHave: true, passRule: "At least bursting strength, GSM and moisture in-house" },
  { id: "Q04", text: "Certificate of Analysis (COA) with every lot?", answerType: "yes_no", mustHave: true, passRule: "Yes" },
  { id: "Q05", text: "Installed capacity and current utilisation (tonnes/month)", answerType: "number", mustHave: true, passRule: "Spare capacity at least 1.5x the volume awarded", appliesTo: "awarded_volume" },
  { id: "Q06", text: "Corrugator type: automatic or semi-automatic", answerType: "choice", mustHave: false },
  { id: "Q07", text: "Standard lead time from PO to dispatch (days)", answerType: "number", mustHave: true, passRule: "10 days or less for repeat items" },
  { id: "Q08", text: "FSC chain-of-custody certificate", answerType: "yes_no", mustHave: false },
  { id: "Q09", text: "Food-safe inks and adhesives declaration for food lines", answerType: "yes_no", mustHave: true, passRule: "Yes (required only for lines that pack food)", appliesTo: "food_lines" },
  { id: "Q10", text: "Rejection rate (PPM) last 12 months", answerType: "number", mustHave: false },
];

export const TERMS = [
  "Prices per piece, in INR, excluding GST, delivered to Hosur plant (FOR destination).",
  "Annual contract, monthly call-offs. Quantity tolerance ±10%.",
  "Payment 60 days from receipt of goods.",
  "Quote validity at least 30 days. State any paper-price escalation clause.",
  "Specs as per attached sheet. State any deviation in GSM, BF or dimensions.",
  "Reply in any format you like. Our template is attached for convenience.",
];
