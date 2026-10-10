// Core types for the read → normalise → verify → status pipeline.
// See docs: architecture/how-we-solve-the-edges.md (claims + checks).

/** Any vendor file, turned into something the model can read and code can check against. */
export interface EvidenceDoc {
  fileName: string;
  kind: "text" | "pdf" | "image";
  /** Addressed text (cells, paragraphs, lines) for text-like files; text layer for PDFs. */
  text: string;
  /** For xlsx: "Sheet!B7" → displayed cell value, for the cell-address check. */
  cellMap?: Record<string, string>;
  pdfBase64?: string;
  image?: { base64: string; mediaType: "image/jpeg" | "image/png" };
  /** Local OCR price tokens with pixel boxes (photos only, offline pipeline). */
  ocr?: { text: string; value: number; box: [number, number, number, number]; conf: number }[];
  /** true when the source has no reliable text to check quotes against (photo, scan). */
  needsSecondRead: boolean;
}

export type PriceStatus = "read_clearly" | "partly_illegible" | "not_quoted" | "refers_to_history" | "ambiguous";
export type UnitBasis = "per_piece" | "per_100" | "per_1000" | "per_kg" | "not_stated";
export type Scope = "explicit_line" | "group_statement_certain" | "group_statement_uncertain";

/** What the model extracted for one RFx line from one vendor reply. */
export interface ExtractedLine {
  rfx_line_id: string;
  source_ref: string;
  source_quote: string;
  vendor_item_text: string;
  match_basis: "buyer_code" | "dimensions_and_ply" | "description" | "none";
  scope: Scope;
  price_status: PriceStatus;
  price_text: string;
  price_value: number; // -1 when no price
  unit_basis: UnitBasis;
  unit_inferred: boolean;
  currency: "INR" | "USD" | "not_stated";
  spec_deviation: string; // "" if none stated
  photo_row_top?: number; // fraction of image height, -1 if n/a (audit F15)
  photo_row_bottom?: number;
}

export interface ExtractedCondition {
  kind: "discount" | "freight" | "payment" | "validity" | "gst" | "tooling" | "escalation" | "delivery" | "other";
  source_ref: string;
  source_quote: string;
  summary: string;
  percent: number; // -1 if n/a
  amount_inr: number; // -1 if n/a
  amount_basis: "per_kg" | "per_colour" | "per_item" | "lump_sum" | "per_order" | "not_applicable";
  days: number; // -1 if n/a
  condition: string; // "" if unconditional
  freight_basis: "delivered_included" | "extra_amount_stated" | "extra_amount_unknown" | "not_about_freight";
  gst_basis?: "prices_exclude_gst" | "prices_include_gst" | "not_about_gst";
}

export interface ExtractedAnswer {
  question_id: string;
  answer_text: string; // "" if not answered
  source_quote: string;
}

export interface ExtractedReply {
  vendor_name: string;
  lines: ExtractedLine[];
  conditions: ExtractedCondition[];
  answers: ExtractedAnswer[];
  attachments_mentioned: string[];
}

export type CheckId =
  | "grounded" | "cell_address" | "second_read" | "magnitude" | "unit_basis" | "history_drift"
  | "spec_deviation" | "scope" | "legibility" | "carried" | "currency" | "missing" | "line_match" | "quote_value" | "row_position" | "ocr";

export interface CheckResult {
  id: CheckId;
  ok: boolean;
  reason: string; // plain words, shown to the buyer when !ok
}

export type CellStatus = "verified" | "converted" | "needs_review" | "missing" | "carried" | "confirmed" | "overridden";

/** One cell of the comparison grid: a vendor's price for an RFx line, with its evidence. */
export interface Cell {
  vendorId: string;
  lineId: string;
  status: CellStatus;
  inrPerPiece: number | null;
  landedPerPiece: number | null;
  landedRange?: [number, number];
  conversion: string[]; // human-readable steps, e.g. "USD 0.504 × 88.40"
  checks: CheckResult[];
  reasons: string[]; // failed-check reasons
  alternatives?: number[]; // other plausible ₹/piece readings (e.g. the second read), for robustness ranges
  source: { file: string; ref: string; quote: string; asWritten: string; photoBand?: [number, number]; pixelBox?: [number, number, number, number] };
  override?: { action: "confirm" | "correct"; value?: number; note: string; by: string; at: string; previous: number | null };
}

/** A buyer's action on a cell, kept client-side and sent with each request. */
export interface Override {
  vendorId: string;
  lineId: string;
  action: "confirm" | "correct";
  value?: number; // INR per piece, for corrections
  note: string;
  at: string;
}
