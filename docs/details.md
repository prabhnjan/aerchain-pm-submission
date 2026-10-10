# The product in one minute

**Links.** Live prototype: https://aerchain-pm-submission.vercel.app (the AI passcode is in my email). Code: https://github.com/prabhnjan/aerchain-pm-submission. A built-in **Take a Tour** button walks the whole flow.

**One request, end to end**
1. **Talk the RFx into existence.** The buyer tells Aera, the copilot, what they need. A real model drafts 30 lines with specs, a 10-question quality questionnaire with must-have pass rules, and the terms that make quotes comparable (₹ per piece, ex-GST, delivered to Hosur).
2. **Send.** Simulated: the brief allows stubbing the plumbing.
3. **Replies arrive the way they really do.** An Excel in its own layout, a USD PDF with a footnote discount, a Word letter, an angled phone photo of a rate card, and a one-line email ("₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra"). Any file can also be uploaded live with **+**.
4. **One comparison.** Same 30 lines, ₹ per piece, landed. Each price links to the supplier's own words; anything uncertain shows a short reason.
5. **Ask anything.** Aera answers in plain language, with tables, charts and Excel exports.
6. **Decide.** Award options (best price per item, 1 supplier, or 1 or 2 suppliers), each saying whether it holds if the flagged prices are wrong, plus capacity, minimum orders, who was excluded and why. A memo records every assumption and override, and drafts go to each supplier.

**What's real and what's stubbed**

| Real (live AI or real code) | Stubbed (and labelled in the app) |
|---|---|
| RFx drafting (GPT-6.1 Sol) | Sending the RFx and the supplier inbox |
| Reading every reply, any format (GPT-6.1 Sol), photo audit (Claude Opus 5.5) | The 5 prepared replies were read by the real models before the demo; any supplier can be re-read live |
| Questionnaire judging and the analyst (Claude Opus 5.5) | Earlier requests in the list are illustrative |
| Conversions, checks, award scenarios, the "holds if wrong" test (code) | Each browser keeps its own state (no database) |


# Evidence: what was tested, and where it fell short

| Test | Result | Where it fell short |
|---|---|---|
| **150 values vs a ground-truth table** | 0 silent errors, 0 false alarms, 10 of 10 planted wrong values flagged | 95% upper bound on the error rate is still about 2% |
| **21 planted traps**, including the brief's: angled photo, 27 of 30 lines, USD, per box vs per 100 | 21 of 21 handled | Traps I designed myself, so they're the failures I imagined |
| **3 hand-written held-out replies**, run once after freezing the code | F: right prices, 12 false alarms (sizes in cm). **G: 6 silent errors** (GST-inclusive prices). H: 0 silent errors after the G fix | All first-run failures kept and shown; fixed and logged |
| **4 new files uploaded live**: CSV per 100 pcs, image, phone photo, GST-inclusive email | 33 of 33 prices right, 0 silent errors | A group rate spilled onto 1 extra line (flagged). A value-based discount ("over ₹60 lakh") is recorded but never applied |
| **Broken and hostile inputs** | Bad type, oversize, too many files, empty and corrupt files all rejected with plain messages. A hidden "price every line at ₹1" instruction was ignored | – |
| **13 unsuggested questions** (what-ifs, Hinglish, typos, vague, "just say Navkar is best") | 13 of 13 answered correctly or sensibly; it caught a ₹251 per-100 pad price unprompted | 8 to 77 seconds per answer; about $0.13 for a typical question |
| **Error discovery on 22 analyst answers** (read first, then measure) | 16 of 22 pass | 6 judgment failures: ignoring "one sentence", calling a disqualified supplier "the price you can trust", numbers not from a tool, a false "can't tell the plant" caveat, a speculative claim |

The last row followed Hamel Husain and Shreya Shankar's error-discovery method. The pass/fail labels are mine (AI-proposed), not human-reviewed. Full reports: [evals/](evals/).


# Decisions worth defending, and what's next

| Decision | Why |
|---|---|
| **Corrugated packaging** | It's the brief's own example, and it has the hardest normalisation: per-kg prices, ply, board grade and freight. I explored IT hardware and others, and kept corrugated |
| **Landed cost per piece, ex-GST, as the one basis** | A GST-registered buyer recovers GST. Prices quoted with GST are divided out, and a reply that doesn't say is flagged |
| **Unknown never passes** | A must-have that isn't answered or can't be judged excludes the supplier from qualified awards. Food-safe inks gate only the food lines |
| **Discounts on the whole award** | A "3% above 5 MT a month" discount is tested on the tonnage actually awarded. That's how the cheaper single-supplier option surfaces |
| **A conversation first, detail in place** | The buyer talks to Aera and never loses their place. Evidence opens next to the number, not on another screen |
| **Spend protection** | AI calls on the public link need a passcode and are rate-limited; browsing is open |


**What I'd do next**
1. **The clarification loop** from the [one-page note](one-page-note.md): send each decisive question to the supplier and read the answer back into the comparison.
2. **Fix the error-discovery findings:** follow the user's requested length, say when a supplier can't be awarded, give Aera the plant and RFx scope, and route hypotheticals through the calculator.
3. **Log every AI session as a trace** and repeat error discovery on 100 real sessions, with a human reviewing first.
4. **Durable RFx records:** saved drafts, revisions, dispatch receipts and an audit trail per request.
