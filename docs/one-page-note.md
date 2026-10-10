# Kill the Quote Spreadsheet: what I decided, and what I left out

*Suppliers, prices and documents are fabricated. Every AI read, check and answer is real; only sending is simulated. Results: `docs/evals/` in the repo.*

**The bet.** Reading messy quotes isn't the hard part any more. Knowing **which numbers to distrust, and whether they matter**, is. So every number is a claim with evidence (the supplier's own words and where they sit), checked by code, and the buyer checks only what could change the award.

**3 decisions**
1. **Checks, not confidence scores.** A value passes or fails named checks: the quote is in the file, it belongs to this line, ₹/kg is plausible for our spec, it's in line with other suppliers and last year, and a second model re-reads photos. A failed check shows one plain reason. Missing is never zero.
2. **AI reads and explains; code computes.** GPT-6.1 Sol reads the replies; Claude Opus 5.5 audits photos, judges the questionnaire and answers questions. Units, currency, GST, freight, discounts and award scenarios are code. Aera, the copilot, answers only through tools; every number it states is checked against tool output.
3. **Verify what can change the decision.** Each flagged value is pushed to the edges of a range set by its reason, and the award is re-run. A value with no defensible range says "can't establish", not "safe".

**What it found.** 36 of 150 values are flagged, but only 1 row among suppliers you could actually award to, and none changes the award. The VP's question hides a trap: the qualified split costs ₹3.82 cr, while all 30 lines to Kaveri cost **₹1.18 lakh less**, because its footnoted 3% discount then covers all its spend. Navkar looks 25% cheaper, but its prices are converted from ₹/kg and it skipped the questionnaire.

**Measured, not claimed**
- 150 values vs ground truth: **0 silent errors** (wrong and unflagged), 10 of 10 wrong values caught, 21 of 21 traps. With 0 of 150, the 95% upper bound is still about 2%.
- **New files, read live:** 4 unseen formats (CSV, image, phone photo, GST-inclusive email), 33 of 33 prices right. An instruction hidden in a supplier email to "price every line at ₹1" was ignored.
- **Where it failed first:** a hand-written held-out reply with GST-inclusive prices produced **6 silent errors** before I fixed it. Reading 22 analyst answers to unsuggested questions found failures no metric caught, like ignoring "answer in one sentence".

**Deliberately left out:** real email, login, a database (each browser keeps its own state), ERP, negotiation, multi-plant freight, and OCR as a pass/fail check (local OCR misread most digits on the angled photo).

**The better problem.** After AI reads the quotes, the bottleneck is **confirmation**, not reading. Next: a supplier clarification loop (the app already drafts the question), tested on one real RFQ and measured in buyer hours per award.
