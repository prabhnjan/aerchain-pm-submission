// The extraction instructions. Stable text first (cached), the RFx next, the reply last.
import type { LineSpec } from "@/lib/domain/spec";
import { dimsLabel } from "@/lib/domain/spec";
import type { Question } from "@/data/rfx";

export const EXTRACT_SYSTEM = `You read supplier quotations sent in reply to a buyer's RFQ and record exactly what each supplier wrote.

Rules:
1. Record, don't fix. Copy prices exactly as written, in the currency and unit the supplier used. Never convert units or currencies yourself.
2. Never guess. If a digit or value is not clearly legible, set price_status to "partly_illegible" and give your best reading in price_value. If a price is absent, use "not_quoted" and -1.
3. Quote your source. For every price, copy the exact supporting text into source_quote and say where it is in source_ref (cell address, page, paragraph, line, or photo row).
4. Return exactly one entry per RFx line, in RFx order. Match supplier items to RFx lines by the buyer's code if present, otherwise by dimensions and ply, otherwise by description. If you can't match an item, leave it out of lines.
5. Group statements: if the supplier gives one rate for a product group or specification class, create an entry for every RFx line it plausibly covers, copy the same quote, and set scope to "group_statement_uncertain" whenever it's not certain which lines are included (e.g. whether trays, pads or partitions count).
6. "Same as last year", "as per last PO" and similar: set price_status to "refers_to_history" with price_value -1. Don't invent the old price.
7. Units: per_piece, per_100, per_1000 or per_kg, as stated. If a price has no unit next to it but the unit clearly carries over from another price in the same sentence, use that unit and set unit_inferred to true. A unit given in a table's column header (e.g. "Rate/Pc") is stated, not inferred. If there's no unit anywhere for that line, use "not_stated" even if you suspect one.
8. Conditions: list every commercial term anywhere in the reply, including footnotes, asterisks and small print: discounts (with their condition), freight, GST rate, payment days, validity, tooling/plate/die charges, escalation clauses.
9. Questionnaire: one entry per question id; empty answer_text if not answered.`;

export function rfxContext(lines: LineSpec[], questions: Question[]): string {
  const rows = lines.map(
    (l) => `${l.id} | ${l.description} | ${l.style} | ${dimsLabel(l)} mm | ${l.ply}-ply ${l.flutes} | ${l.bf} BF | GSM ${l.gsmLayers.join("/")} | ${l.printColours} col | qty ${l.annualQty}`,
  );
  const qs = questions.map((q) => `${q.id}: ${q.text}`);
  return `RFQ lines (id | description | style | inner dims | ply/flute | BF | GSM top-first | print colours | annual qty):\n${rows.join("\n")}\n\nQuestionnaire:\n${qs.join("\n")}`;
}
