// Flat extraction schema: every field required, no nullables (Claude's structured outputs cap
// union types), sentinels instead (-1 / ""), and source_quote listed before the value so the
// model grounds itself before it answers. See research/technical-approaches.md.
import { z } from "zod";

export const LineSchema = z.object({
  rfx_line_id: z.string().describe("The buyer's line id from the RFx list, e.g. PK-SHP-001"),
  source_ref: z.string().describe("Where in the reply: cell address like 'Quotation!I7', 'page 2', '¶12', 'L3', or 'photo row 9'. Empty if not quoted."),
  source_quote: z.string().describe("Exact text copied from the reply that supports this price. Empty if not quoted."),
  vendor_item_text: z.string().describe("How the vendor named or described the item. Empty if absent."),
  match_basis: z.enum(["buyer_code", "dimensions_and_ply", "description", "none"]),
  scope: z.enum(["explicit_line", "group_statement_certain", "group_statement_uncertain"])
    .describe("explicit_line = the reply prices this line individually; group_statement_* = a statement covering several lines, and whether it's certain this line is included"),
  price_status: z.enum(["read_clearly", "partly_illegible", "not_quoted", "refers_to_history", "ambiguous"]),
  price_text: z.string().describe("The price exactly as written, including currency/unit words. Empty if none."),
  price_value: z.number().describe("Numeric price as written (before any conversion). -1 if no price."),
  unit_basis: z.enum(["per_piece", "per_100", "per_1000", "per_kg", "not_stated"]),
  unit_inferred: z.boolean().describe("true only if the unit is not written for this price and you carried it over from another price in the same sentence. A unit in a table column header counts as stated: false."),
  currency: z.enum(["INR", "USD", "not_stated"]),
  spec_deviation: z.string().describe("Any deviation from the RFx spec the vendor states for this line (GSM, BF, size). Empty if none."),
  photo_row_top: z.number().describe("Only for prices read from an image: top edge of the row containing this price, as a fraction of image height (0 = top, 1 = bottom). -1 otherwise."),
  photo_row_bottom: z.number().describe("Only for prices read from an image: bottom edge of that row, as a fraction of image height. -1 otherwise."),
});

export const ConditionSchema = z.object({
  kind: z.enum(["discount", "freight", "payment", "validity", "gst", "tooling", "escalation", "delivery", "other"]),
  source_ref: z.string(),
  source_quote: z.string().describe("Exact text from the reply, including footnotes and small print"),
  summary: z.string(),
  percent: z.number().describe("Percentage if any (e.g. 3 for 3%, 12 for GST 12%), else -1"),
  amount_inr: z.number().describe("Money amount in INR if any, else -1"),
  amount_basis: z.enum(["per_kg", "per_colour", "per_item", "lump_sum", "per_order", "not_applicable"]),
  days: z.number().describe("Days if the term is about time (payment, validity, lead time), else -1"),
  condition: z.string().describe("When it applies, e.g. 'monthly offtake above 5 MT'. Empty if unconditional."),
  gst_basis: z.enum(["prices_exclude_gst", "prices_include_gst", "not_about_gst"])
    .describe("Only for GST/tax terms: do the quoted prices already include GST ('inclusive of GST', 'incl. GST') or is GST extra on top? Otherwise not_about_gst."),
  freight_basis: z.enum(["delivered_included", "extra_amount_stated", "extra_amount_unknown", "not_about_freight"])
    .describe("Only for freight/delivery terms: is freight included in the price (FOR/door delivery), charged extra with an amount, or extra with no amount? Otherwise not_about_freight."),
});

export const AnswerSchema = z.object({
  question_id: z.string(),
  answer_text: z.string().describe("The vendor's answer. Empty if not answered."),
  source_quote: z.string(),
});

export const ReplySchema = z.object({
  vendor_name: z.string(),
  lines: z.array(LineSchema).describe("Exactly one entry per RFx line, in RFx order, including lines the vendor did not quote"),
  conditions: z.array(ConditionSchema).describe("Every commercial term or condition anywhere in the reply, including footnotes"),
  answers: z.array(AnswerSchema).describe("One entry per questionnaire question"),
  attachments_mentioned: z.array(z.string()),
});

export type ReplyExtraction = z.infer<typeof ReplySchema>;
