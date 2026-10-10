// Ground-truth types. The truth is what each vendor actually meant; the messy files are
// rendered from it, and every eval compares the system's output against it.

export type VendorId = "A" | "B" | "C" | "D" | "E";
export type Basis = "per_piece" | "per_100" | "per_kg";

export interface TruthCell {
  vendorId: VendorId;
  lineId: string;
  /** quoted = price given; carried = "same as last year"; missing = no price at all */
  state: "quoted" | "carried" | "missing";
  vendorLineName?: string; // how the vendor wrote the line
  native?: { value: number; basis: Basis; currency: "INR" | "USD"; basisStated: boolean };
  asWritten?: string; // the text as it appears in the reply
  inrPerPiece: number | null; // ex-GST, before freight/tooling/discount
  landedPerPiece: number | null; // ex-GST, incl. freight and tooling; null if unknown
  landedRange?: [number, number]; // when freight is unknown
  specDeviation?: string;
  trapIds: string[];
}

export interface TruthTerms {
  freight: "delivered" | "ex_works_stated" | "ex_works_unknown";
  freightInrPerKg?: number;
  paymentDays?: number;
  validityDays?: number;
  gstStated?: string; // as the vendor wrote it
  discount?: { percent: number; condition: string; appliesTo: "all" };
  tooling?: { platePerColourInr: number; diePerItemInr: number };
  currency: "INR" | "USD";
}

export interface TruthAnswer {
  questionId: string;
  answer: string | null; // null = not answered
  pass: boolean | null; // null = can't tell / not answered
  note?: string;
}

export interface TruthVendor {
  id: VendorId;
  name: string;
  location: string;
  format: "xlsx" | "pdf" | "docx" | "photo" | "email";
  replyDay: number; // days after the RFx was sent
  terms: TruthTerms;
  answers: TruthAnswer[];
  clearsQuestionnaire: boolean | null; // null = not answered
}

export interface Trap {
  id: string;
  vendorId: VendorId;
  lineIds: string[]; // empty = vendor-level
  what: string;
  expected: "flag" | "convert_and_show" | "missing_not_zero" | "carried_and_flag" | "condition_not_baked_in" | "fail_questionnaire" | "landed_cost";
}

export interface Truth {
  generatedAt: string;
  fx: { usdInr: number; date: string; source: string };
  vendors: TruthVendor[];
  cells: TruthCell[];
  history: { vendorId: VendorId; lineId: string; inrPerPiece: number; ref: string }[];
  traps: Trap[];
}
