# Advanced Evals: Error Discovery on the Analyst

**Method:** Hamel Husain and Shreya Shankar, *Advanced evals: how to find (and fix) hidden AI failures* (Lenny's Newsletter, 22 Sep 2026). Read real outputs first to find the failures worth measuring, then turn them into checks and priorities.
**Run:** 10 Oct 2026 (AI-assisted). 22 analyst traces: 9 from synthetic queries generated from dimensions, plus 13 hand-written questions. The article recommends about 100; read the counts as signals, not rates.

> Pass/fail labels are AI-proposed, not human-reviewed. Each failure below quotes a real answer, so anyone can check it by reading.

## Headline

**16 of 22 answers pass. The 6 failures are judgment failures, not wrong numbers.** No answer contradicted the engine on a core figure, and every pushy or out-of-scope request was handled well. What fails is product behaviour that metric-first evals didn't measure. **The dimension-based synthetic queries found far more of these (5 in 9) than hand-written questions (1 in 13)**, which is the article's case for diverse simulated users.

## Method

1. **Synthetic users from dimensions.** 4 dimensions: **task** (10, from price lookup to out of scope), **persona** (buyer, VP, finance, plant quality), **clarity** (clear, ambiguous, pushy), **style** (plain, Hinglish, terse with typos). 40 balanced scenarios, **one model call per scenario** to write each query. 4 "out of scope" queries came out in scope, so that dimension was sharpened and they were regenerated.
2. **Traces.** Each query went through the live analyst; each trace kept the input, scenario, answer, every tool call, artifacts, the number check, latency and cost.
3. **Read and annotate.** A small review app rendered each answer as the buyer sees it, with tool calls alongside and filters by dimension. Each trace got a note on the first thing that went wrong for the user.
4. **Failure modes → checks.** Notes were grouped into failure modes and counted, then turned into code checks calibrated against the labels.

## Failure modes

| # | Failure mode | Count | Example | Fix |
|---|---|---|---|---|
| FM1 | **Ignores an explicit length or format request** | 2 of 2 requests | VP: "decision and main risk **in one sentence**" → 224 words | "If the user asks for a length or format, follow it" in the analyst's rules |
| FM6 | **Calls a supplier that failed quality the cheapest or most trustworthy, without saying so** | 2 | "The cheapest price you can trust is Shree Ambika ₹53.57" (its ISO has expired) | Return eligibility with each price; never call an ineligible price "best" without saying it can't be awarded |
| FM3 | **A number not found in any tool result** | 3 | A guessed "₹2.51" for the ₹251 pad; a "23%" | Compute hypotheticals with the calculator tool |
| FM4 | **Headline total built on its own unconfirmed correction** | 1 | "About ₹3.87 crore" assumes ₹251 is really ₹2.51, disclosed later | Lead with the system's figure; give the corrected one as "if confirmed" |
| FM2 | **False caveat from a context gap** | 1 | "I can't separate out the Hosur items". Every line is for Hosur | Put the plant and RFx scope in the overview tool |
| FM5 | **Speculation stated as likely** | 1 | Navkar's low price is "exactly what you'd expect if the board is lighter than spec". No evidence | Separate "the data shows" from "a possible reason" |
| FM7 | **Slow or costly answers** | 6 over 45 s | Up to 82 s on table-building and multi-constraint questions | Lower effort for lookups; stream progress |

**What it does well:**
- **Held firm when pushed to bend the rules:** "mark all 5 compliant", "say Kaveri meets spec", "say Navkar is best".
- **Answered from the data on out-of-scope questions:** financial stability and paper prices.
- **Mirrored the user's language:** Hinglish in, Hinglish out.
- **Caught the ₹251 per-100 pad error unprompted** in 5 answers.
- **Never invented a budget:** it said there isn't one and offered last year as a stand-in.

## Automated checks, calibrated against the labels

| Check | Result | Agreement with labels |
|---|---|---|
| FM1 brevity request honoured | 0/2 | 2/2 |
| FM2 no false plant caveat | 21/22 | ✓ |
| FM3 every number in a tool result | 19/22 | ✓ (the app's own number check) |
| FM6 ineligible supplier named best without caveat | flagged 5 | 2 right (one the first read had missed), 2 false alarms, 1 borderline: too blunt as a regex; needs an LLM judge validated on labels |
| FM7 latency ≤ 45 s | 16/22 | ✓ |

## Next

Apply the FM1, FM2, FM3 and FM6 fixes (each is one rule or tool change), re-run the same queries and compare; log every real session as a trace; and repeat error discovery on 100 sessions with a human reviewing first.
