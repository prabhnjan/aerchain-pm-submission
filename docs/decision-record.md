# Decision record (current)

**This file is the current truth.** Older working notes (`open-decisions-and-assumptions.md`, `assumptions-register.md`, `architecture/*`) keep their history with strikethroughs. Where they disagree with this file, this file wins. Created 2026-10-09 in response to the Codex audit (F05, F06, F08, F25, F26). Every row matches the running prototype.

## 1. Product decisions

| Decision | Chosen | Why | Evidence | Limitation |
|---|---|---|---|---|
| Category | Corrugated packaging, 30 lines, 5 vendors | The brief's own examples (per kg, 5-ply, freight extra) are corrugated | `research/domain-corrugated.md` | Data is fabricated; quantities scaled to ≈ ₹4 crore |
| Core bet | **Decision-aware verification**: every number is a claim with evidence; the buyer checks only what could change the award | The brief's sharpest test is "what does it show when it isn't sure" | Latest run (`data/runs/latest.json`): 45 of 150 cells need attention = 36 flagged (35 needs review + 1 carried) + 9 not quoted; Review shows which can change the VP's award (none) | A tested hypothesis, not a claim about what Aerchain's product lacks |
| Reader / auditor | GPT-6.1 Sol reads every file; Claude Opus 5.5 re-reads photos on enlarged crops and judges the questionnaire; Opus 5.5 is the analyst | Different providers are less likely to share a misreading | Run logs in `prototype/data/runs/latest.json` | Agreement isn't proof: two models can share a mistake (audit F15) |
| Persistence | No database. Seeded run in the repo; overrides and live re-reads live in each browser | Session isolation for a public demo; nothing to pause before the live demo | `prototype/components/WorkspaceContext.tsx` | Nothing is shared between users; reload loses live re-reads; "Reset demo" restores the start |
| Live vs stored | The tour uses a **stored run** produced by the real models on 9 Oct; any supplier can be re-read live and any new reply uploaded (the "+" on the comparison) through the same code path | Speed for the tour, honesty about provenance (audit F02) | ~~Responses tab labels~~ The responses card says the prepared replies were read by real models on the stored date and new uploads are read live; each supplier's detail says "Stored run…" or "Read live…" | A live photo read takes up to ~2 minutes |
| Main canvas and Ask | ~~The app opens on Compare with a decision strip and an Ask bar on every tab~~ **As built (10 Oct):** a request list on the left and Aera, the copilot, always on the right. The buyer drafts the RFx by talking, sends it (simulated), replies arrive, then the comparison, checks and award options open inside the same request; detail opens in place or in a centred dialog | The conversation is the product; the buyer never loses their place (user feedback, 10 Oct) | `components/Workspace.tsx`, `components/canvas/Canvas.tsx`, `components/chat/Chat.tsx` | Single demo request; earlier requests are illustrative |
| Email | Outbound is simulated (send confirmation, no email leaves the app); inbound is the 5 prepared replies or a live upload | Brief: "Fake the SMTP server if you like" | Send confirmation dialog; "+" Add a reply | No real inbox |

## 2. The award contract (audit F05, F08)

All award maths is code (`prototype/lib/scenario/index.ts`), never the model.

| Item | Rule |
|---|---|
| Delivery point | **One plant: Hosur.** The RFx asks for FOR Hosur. (Audit F26: the research note mentions 2 plants; the demo deliberately uses 1.) |
| Comparison basis | **Landed cost per piece, ex-GST**: quoted price → INR (one dated FX rate) → per piece (unit rules; per-kg via spec box weight) + stated freight per kg × box weight + tooling ÷ annual quantity. GST is never in the ranking: a GST-registered buyer recovers it as input credit. A stated GST rate other than 5% is a compliance flag, not a price change. **Prices quoted inclusive of GST are divided by (1 + rate)**, and a reply that doesn't state GST treatment is flagged (held-out G found this as a silent error) |
| Unknown freight | Ranked at the midpoint of the buyer's lane estimate (₹1.5–3.0/kg); the full range is kept and used in robustness |
| Quantities | Annual quantity per line from the RFx; the horizon is one annual contract |
| Missing quotes | Never zero. A missing line is excluded for that vendor; uncovered lines are listed separately |
| Rules offered | Cheapest per line (the VP's literal question); one vendor; at most N vendors; each with a vendor filter (all / cleared quality / a list) |
| Conditional discounts | Evaluated on the **whole allocation** (e.g. "3% if monthly offtake > 5 MT" uses the tonnage actually awarded to that vendor). Never baked into unit prices. The "at most N vendors" search compares allocations **after** discounts |
| Ties | Lowest landed price wins; equal prices keep the first vendor alphabetically (deterministic). Not material in the demo data |
| Overrides | A buyer can confirm or correct a value (a reason is required for corrections). The award uses the corrected value and the memo lists every override |
| When it's provisional | If any uncertain value could flip a winner, or can't be bounded, the award says "Confirm before awarding" and lists them |
| Capacity | Each vendor's awarded tonnes/month must fit its spare capacity ÷ 1.5; enforced inside every rule, including the "at most N vendors" search; shown in the Award tab and memo |
| Not modelled (shown as limits) | ~~MOQ~~ (as built: a vendor's MOQ is read from its reply; awarded lines whose monthly call-off is below it get the ordering interval; an MOQ above the whole annual need is a BLOCKER), freight per shipment, payment-term cost of money, price escalation clauses, multi-plant lanes, partial-line splits |

## 3. Qualification (audit F06)

| Item | Rule |
|---|---|
| Unit of qualification | ~~**Vendor-level** in this demo~~ **Vendor-wide plus line-scoped** (audit F06, as built): GSTIN, ISO 9001 valid on the award date, in-house lab, COA, capacity and lead time decide whether a vendor clears. **Food-safe inks only gate the 15 food lines**, so a vendor without that declaration can still win non-food lines (`lib/questionnaire/eligibility.ts`) |
| Capacity | ~~Judged against the full annual volume~~ **As built: enforced in the award** (audit F06/F21). Awardable tonnes/month = spare capacity (from the vendor's own answer) ÷ 1.5. Over the limit → the lines cheapest to move go to the next vendor with room; a capacity that isn't stated excludes the vendor under a quality rule. Probe: capping Kaveri at 20 t/month moves 9 lines to A under the VP rule |
| Evidence | Answers plus attachments (e.g. the ISO certificate's expiry date). The judge must quote its evidence |
| Unknown | "Unclear" or "not answered" on any must-have = **does not clear**. Unknown never quietly passes |
| Rules frozen | The pass rules are part of the RFx (`prototype/data/rfx.ts`), set before bids arrive |
| Proof | Probe: making A fail only the food-safe declaration moves exactly A's 5 food lines and keeps its 6 non-food wins (`scripts/audit-probes.ts`) |
| Not modelled | Capacity per line (it's per vendor, in tonnes/month) |

## 4. Uncertainty policy (audit F07, F14, F22)

| Reason a value is uncertain | Plausible range used in robustness |
|---|---|
| Two reads disagree (photo) | The two readings |
| Price looks like a per-100 price read as per piece | The value and the value ÷ 100 |
| Per-kg quote converted with a modelled box weight | ±10% |
| Carried from last year ("same as last year") | ±10%, and always "confirm": it's a reference to a prior source, not a fresh quote |
| Freight extra, amount unknown | The buyer's lane range |
| Spec deviation (e.g. lighter board) | Tested as an eligibility question: re-run the award without the bid |
| Rate given for a group, not certain it covers this line | **Unbounded: "can't establish"**. Counts against "decision holds" |
| Anything else flagged | ±15% |

## 5. What makes a cell quiet (audit F04)

A cell is shown as **"Checks passed"** (not "verified") only if every check that applies passed: the quote is found in the file; the Excel cell holds the value; the line match holds (no other item code or size next to the price); the price appears inside the vendor text quoted for it (catches shifted rows, audit F15; for photos, the source panel highlights the row the reader says it used, enlarges it, and shows a pixel box where local OCR, which isn't AI, reads the same digits); the price is physically plausible (₹30–90/kg from the spec) and in line with the other vendors; it's within the drift band vs last year; the second read agrees (photos); no inferred unit, group scope, spec deviation or legibility issue. "Checks passed" is still a machine reading. It isn't a human confirmation, and the label says so.

## 6. Deliberately out of scope

Real email in or out; login; database; ERP; negotiation; ~~supersession across separate replies~~ (as built: a new reply from a vendor supersedes the earlier one, which stays on record with its time, audit F13); ~~line-level qualification~~ (as built for food lines); multi-plant freight; ~~MOQ and capacity in the award~~ (as built: capacity enforced and MOQ noted, §2 and §3); scaling beyond 5 vendors × 30 lines in the UI.
