# Quote Desk

**Kill the Quote Spreadsheet**: a prototype for Aerchain's PM take-home. A buyer drafts an RFQ, 5 vendors reply in messy formats, the app reads every reply, shows what it isn't sure about, and answers the VP's questions with computed numbers.

> Vendors, prices and documents are fabricated. Every AI read, check and answer runs on real models: GPT-6.1 Sol reads, Claude Opus 5.5 audits photos and answers questions.

## The one rule

**Every number is a claim with evidence.** The reader must quote where each price came from. Code then checks each claim independently, and the buyer checks only what could change the award.

| Stage | What runs | Where |
|---|---|---|
| Ingest | xlsx/csv → addressed cells, docx → paragraphs, pdf → text layer + document, photo → image (+ offline OCR) | `lib/ingest/` |
| Extract | GPT-6.1 Sol, schema-constrained, a source quote for every value | `lib/extract/` |
| Audit | Claude Opus 5.5 re-reads photos on enlarged crops | `lib/extract/index.ts` |
| Normalise + checks | FX, units, per-kg via spec box weight, GST basis, freight, tooling; quote found, cell match, line match, quote-value, plausibility (₹/kg), vs vendors, vs last year | `lib/pipeline/normalise.ts` |
| Qualification | Answers + certificates vs pass rules; food-line gate; unknown never passes | `lib/questionnaire/` |
| Award | Cheapest per line / 1 vendor / ≤N vendors; discounts on the whole allocation; capacity; MOQ; robustness ("can this flag change the winner?") | `lib/scenario/` |
| Analyst | Claude Opus 5.5 with typed tools only; number check on every answer | `lib/analyst/` |

The current rules are in [`docs/decision-record.md`](docs/decision-record.md), summarised in the app under Settings → Method & evidence.

## Measured results

| Test | Result |
|---|---|
| 150 values (5 vendors × 30 lines) vs ground truth | **0 silent errors**, 0 false alarms, 10 of 10 wrong values flagged |
| 21 planted traps (USD, footnote discount, per-100, smudged photo, "same as last year", …) | 21 of 21 handled |
| Held-out F (hand-written, cm sizes) | First run: 0 silent, 12 false alarms → fixed: 12/12 |
| Held-out G (hand-written, GST-inclusive) | First run: **6 silent errors** → fixed: 10/10 |
| Held-out H (hand-written CSV, typo'd code; run after the G fix) | First run: **0 silent**, 3 false alarms → fixed: 0 silent |

0 of 150 silent errors still leaves a 95% upper bound of about 2% per value. These are results on these files, not a general accuracy rate.

## Run it

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev                  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run data:truth` / `npm run data:render` | Rebuild the ground truth and the 5 messy vendor replies |
| `npm run pipeline` | Real AI extraction of all replies (about $0.80) → `data/runs/latest.json` |
| `npm run pipeline:cached` | Re-run only the code stages on the stored extraction (free) |
| `npm run eval:cells` · `npx tsx evals/traps.eval.ts` · `npx tsx evals/heldout.eval.ts --id=G` | The evals |
| `npx tsx scripts/audit-probes.ts` | Probes from an external design review of the prototype (wrong-line value, discount-aware search, food-line gate, capacity, MOQ) |

## Licence

© 2026 Prabhanjan Kulkarni. All rights reserved. See `LICENSE`.
