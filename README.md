# Kill the Quote Spreadsheet

Prabhanjan Kulkarni · Product Manager take-home for Aerchain · October 2026

| What | Where |
|---|---|
| **Live prototype** | [aerchain-pm-submission.vercel.app](https://aerchain-pm-submission.vercel.app). The AI features are **passcode-protected**; the passcode is in my email |
| **Loom walkthrough** (about 5 min) | [Watch on Loom](https://www.loom.com/share/032b5aab46b6427aa17225794838eaf3) |
| One-page note | [docs/one-page-note.md](docs/one-page-note.md) |
| Details: the product in one minute, evidence, decisions and what's next | [docs/details.md](docs/details.md) |
| Decision record (every rule and why) | [docs/decision-record.md](docs/decision-record.md) |
| Eval battery | [docs/evals/eval-battery.md](docs/evals/eval-battery.md) |
| Live-upload test (4 unseen replies) | [docs/evals/live-upload-test.md](docs/evals/live-upload-test.md) |
| Advanced evals (error discovery on the analyst) | [docs/evals/advanced-evals.md](docs/evals/advanced-evals.md) |

## In one paragraph

A buyer (Paul Mehta at Warner Logistics) sends an RFQ for 30 corrugated box lines. 5 suppliers reply in messy formats: Excel, PDF, Word, an email and a phone photo. The app reads every reply, turns each price into a **claim with evidence** (the supplier's own words and where they sit), checks it in code, flags only what could change the award, and lets the buyer ask Aera, the copilot, questions answered with computed numbers.

Suppliers, prices and documents are fabricated. Every AI read, check and answer is real: GPT-6.1 Sol reads the replies; Claude Opus 5.5 re-reads photos, judges the questionnaire and answers questions. Only sending is simulated.

## Results

| Test | Result |
|---|---|
| 150 values (5 suppliers × 30 lines) vs ground truth | **0 silent errors** (wrong and unflagged), 0 false alarms, 10 of 10 wrong values flagged |
| 21 planted traps (USD, footnote discount, per-100, smudged photo, "same as last year", …) | 21 of 21 |
| 4 unseen uploads (CSV, image, phone photo, GST-inclusive email) | 33 of 33 prices right |
| Prompt injection in a supplier email | Ignored |
| 3 hand-written held-out replies | First runs found real failures (6 silent errors on G); fixed, then re-run |
| 22 analyst answers read one by one | 16 pass; 6 judgment failures, written up as failure modes |

0 of 150 still leaves a 95% upper bound of about 2% per value. These are results on these files, not a general accuracy rate.

## Glossary

| Term | Meaning |
|---|---|
| RFx / RFQ | The request for quotation the buyer sends to suppliers |
| Claim | One value read from a reply (a price, freight, GST basis…) with the quote it came from |
| Check | A named test a claim passes or fails: quote found in the file, right line, ₹/kg plausible, in line with other suppliers and last year, photo re-read. A failure shows one plain reason. Missing is never zero |
| Silent error | A wrong value that wasn't flagged. The number that matters most |
| Landed cost | Price per piece after unit conversion, discounts, freight and GST basis |
| Qualified | A supplier whose questionnaire answers and certificates pass the rules; unknown never passes |
| Scenario | An award split: cheapest per line, 1 supplier, or at most N suppliers, with capacity and MOQ |
| Robustness | Pushing a flagged value to the edges of its range and re-running the award: can this flag change the winner? |
| Aera | The copilot. Answers only through typed tools; every number it states is checked against tool output |
| Held-out | Replies written after the system was built, run once to see how it fails on something new |

## What's where

| Path | What's in it |
|---|---|
| `app/` | Next.js pages and the 3 AI endpoints: `api/draft` (RFQ copilot), `api/extract` (read a reply), `api/ask` (Aera) |
| `components/` | The UI: request list, chat, always-on workspace (`tabs/` are its views: draft, replies, compare, review, award, evidence), guided tour, upload |
| `lib/ingest/` | Turns files into addressable evidence: Excel cells, Word paragraphs, PDF text, photos |
| `lib/extract/` | The reading prompt and schema: every value must quote its source |
| `lib/pipeline/` | Normalising (units, currency, GST, freight, tooling) and all the checks |
| `lib/questionnaire/` | Qualification rules, including the food-line gate |
| `lib/scenario/` | Award scenarios, discounts, capacity, MOQ, robustness |
| `lib/analyst/`, `lib/copilot/` | Aera's tools and the RFQ drafting copilot |
| `lib/ai/` | Model clients. `lib/guard.ts`: passcode and rate limit (12 AI calls a minute per user) |
| `config/categories/` | Category knowledge for corrugated boxes (₹/kg ranges, spec weights) |
| `data/` | The RFQ, the 5 supplier replies, ground truth, held-out replies, and the stored run (`runs/latest.json`) the app opens on |
| `evals/` | Eval code and stored results: cells, traps, held-out |
| `scripts/` | Pipeline runner and small probes |
| `public/replies/` | The same supplier files, downloadable from the app |
| `docs/` | The one-page note, the details, the decision record, eval reports, and the test files used in them |

## Run it locally

```bash
npm install
cp .env.example .env.local   # add your OpenAI and Anthropic keys
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run pipeline:cached` | Re-run the code stages on the stored extraction (free) |
| `npm run pipeline` | Real AI extraction of all 5 replies (about $0.80) |
| `npm run eval:cells` · `npx tsx evals/traps.eval.ts` · `npx tsx evals/heldout.eval.ts --id=G` | The evals |
| `npm run data:truth` · `npm run data:render` | Rebuild the ground truth and the supplier replies |
| `npx tsx scripts/audit-probes.ts` | Probes from an external design review |

## Licence

© 2026 Prabhanjan Kulkarni. All rights reserved. Shared for review as part of a job application to Aerchain. See `LICENSE`.
