# Quote Desk: what I decided, and what I left out

*Vendors, prices and documents are fabricated. Every AI read, check and answer is real. Numbers come from reproducible runs in `prototype/evals/`.*

**The bet.** Reading messy quotes isn't the hard part any more. Knowing **which numbers to distrust, and whether they matter**, is. Every number is a claim with evidence (the vendor's words and where they are), checked by code, and the buyer checks only what could change the award.

**3 decisions**
1. **Checks, not confidence scores.** A value passes or fails named checks: the quote is in the file, the Excel cell matches, it belongs to this line, the price is in the quoted text, ₹/kg is plausible for our own spec, it's in line with other vendors and last year, and a second model (Claude Opus 5.5) re-reads photos. A failed check shows one plain reason. Missing is never zero.
2. **AI reads and explains; code computes.** GPT-6.1 Sol extracts. Units, currency, GST, freight, tooling, capacity, MOQ, discounts and scenarios are code. The analyst answers only through tools; every number it states must appear in a tool result.
3. **Verify what can change the decision.** Each flagged value is pushed to the edges of a range set by its reason, and the whole award is re-run. Values with no defensible range say "can't establish", not "safe".

**What it found.** 36 of 150 values are flagged and 9 lines weren't quoted; under the VP's rule none of the flags can change the award. The VP's question has a trap: splitting between the 2 vendors that cleared quality costs ₹3.82 cr, while all 30 lines to Kaveri cost **₹1.18 lakh less**, because splitting forfeits part of its footnoted 3% volume discount. Navkar looks 25% cheaper, but all 30 of its prices are unconfirmed and it skipped the questionnaire.

**Measured, not claimed**
- 150 values vs ground truth: **0 silent errors** (wrong and unflagged), 10 of 10 wrong values caught, 0 false alarms, 21 of 21 traps. With 0 of 150, the 95% upper bound is still about 2%.
- **3 replies written by hand after freezing the pipeline, each run once.** G (prices including GST) produced **6 silent errors**: GST-inclusive prices compared as ex-GST. The third, H, run after fixing that, had 0 silent errors and caught a vendor's typo'd item code, but showed 3 false alarms. Every first-run failure is shown in the app, then fixed and logged.

**Deliberately left out:** real email, login, a database (each browser keeps its own state), ERP, negotiation, multi-plant freight, a with-GST cash view, and OCR as a pass/fail check (local OCR misread most digits on the angled photo, so it only adds pixel-exact boxes where it agrees).

**The better problem.** After AI extraction, the bottleneck is **confirmation**, not reading. Next: a vendor clarification loop (the app already drafts one question per decisive value), tested on one real RFQ, measuring buyer hours per award.
