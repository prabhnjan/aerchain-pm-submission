# Advanced evals: error discovery on the analyst

**Method:** Hamel Husain and Shreya Shankar, *Advanced evals: how to find (and fix) hidden AI failures* (Lenny's Newsletter, 22 Sep 2026). Find failures by reading real outputs before choosing metrics, then turn failure modes into checks and priorities.
**Run:** 10 Oct 2026, about 17:30–18:05 IST, by Claude, on the live local prototype.
**Stopped early:** the Anthropic account hit its monthly spend limit after 9 of 40 new traces (*"You have reached your specified API usage limits… until 2026-11-01"*). The analysis below uses those 9 plus 13 complete answers from the earlier battery (22 traces). The article recommends about 100; treat the counts as signals, not rates.

## Headline

> **Labels are AI-proposed (Claude), not human-reviewed.** Each failure is quoted from a real answer and can be checked by reading it, but the pass/fail calls and the check calibration reflect Claude's judgment. A human review pass was skipped by choice for this take-home.

**16 of 22 answers pass (73%). The 6 failures are judgment failures, not wrong numbers.** No answer contradicted the engine on a core figure, and all 4 pushy or out-of-scope requests were handled well. What fails is product behaviour our earlier, metric-first evals never measured:
- ignoring an explicit "one sentence" or "terse" request;
- naming a supplier that failed quality as the cheapest "you can trust";
- leading with a number built on the AI's own unconfirmed correction;
- a speculative "lighter board" claim;
- a false caveat about the plant.

**The synthetic, dimension-based queries found far more of these: 5 failures in 9, against 1 in 13 for my hand-written questions.** That's exactly the article's case for diverse simulated users over a tester's own questions.

## Steps followed

| Article step | What we did | Files |
|---|---|---|
| 1. Traces (simulate users if needed) | Defined 4 dimensions: **task** (10), **persona** (buyer, VP, finance, plant quality), **clarity** (clear, ambiguous, pushy), **style** (plain, Hinglish, terse with typos). Sampled 40 balanced scenarios and made **one model call per scenario** (gpt-6-luna) to write the query. Reviewed them: 4 "out of scope" ones came out in scope, so I sharpened that dimension and regenerated those 4. Ran each through `/api/ask` and logged one full trace per session: input, scenario, output, every tool call with inputs and summaries, artifacts, number check, latency and cost | `dimensions.json`, `gen-queries.mjs`, `queries.jsonl`, `run-traces.mjs`, `traces.jsonl` |
| 2. Review and annotate | Built a **custom review app**: each answer rendered as the buyer sees it, tool calls alongside, filters by each dimension, a free-text note, pass/fail, and Claude's suggested annotation to **accept or reject**. Notes export to JSON. **Your part:** open it and review at least 10 traces yourself before trusting my labels (the article's guard against automation bias) | `build-review.mjs` → `review.html`; my labels in `annotations-agent.json` |
| 3. Failure modes → priorities | Grouped the notes into failure modes and counted them (below) | this file |
| 4. Checks for the top modes | Code checks (free, re-runnable on any trace file), **calibrated against my labels** | `checks.mjs` → `checks-results.json` |

## Failure modes found (22 traces)

| # | Failure mode | Count | Example | Likely cause | Fix (not done) |
|---|---|---|---|---|---|
| **FM1** | **Ignores an explicit length or format request** | **2 of 2** requests | VP: "decision and main risk **in one sentence**" → 224 words (S04). "terse pls" → 200 words (S02) | The analyst's rule says "2 to 4 sentences" but nothing says *the user's own format request wins* | One prompt line: "If the user asks for a length or format, follow it exactly; offer detail after." Keep the FM1 check in CI |
| **FM6** | **Names a supplier that failed quality as the cheapest or most trustworthy, without saying so** | **2** | "The cheapest price you can trust is Shree Ambika ₹53.57" (Q01). "Lowest firm quote is Shree Ambika ₹43.32" (S01). Ambika's ISO expired, so it can't be awarded | `line_detail` returns prices without eligibility; the model caveats Navkar but forgets Ambika | Add `eligible: yes/no + why` to the line tool output; rule: "never call an ineligible supplier's price the best without saying it can't be awarded" |
| **FM3** | **A number not found in any tool result** | **3** | "₹2.51" (its own guess at the pad price, S09 and Q13); "23%" (Q01) | Hypotheticals computed in the model's head instead of via `calc` | Rule: compute hypotheticals with `calc` (then they're traceable). The UI already shows these with an amber badge |
| **FM4** | **Headline total built on the AI's own unconfirmed correction** | 1 | "The 27 covered lines come to about ₹3.87 crore" assumes the ₹251 pad is ₹2.51 (S03). Disclosed later in a bullet | Helpful instinct, wrong order | Lead with the system's figure and the caveat; give the corrected figure as "if confirmed" |
| **FM2** | **False caveat from a context gap** | 1 | "None of the line data says which plant each item is for, so I can't separate out the Hosur items" (S04). All lines are for Hosur | The plant and buyer aren't in any tool output | Put buyer, plant and RFx scope in `overview` |
| **FM5** | **Speculation stated as likely** | 1 | Navkar 14–41% cheaper is "exactly what you'd expect if the board is lighter than spec" (S06). No evidence of a lighter board | Model reasoning beyond the evidence | Rule: separate "the data shows" from "a possible reason"; an LLM judge for this mode, validated on labels |
| **FM7** | **Slow or costly answers** | 6 over 45 s; 4 over $0.50 | Up to 82 s and $1.17 (table-building and multi-constraint questions) | Many tool calls, large tables | Lower effort for simple lookups; stream progress ("running the award…"); cap table rows |

**What it does well (keep):**
- **Held firm on 3 of 3 attempts to bend the rules:** "mark all 5 compliant" (S05), "say Kaveri meets spec" (S02), "say Navkar is best" (Q10).
- **Answered from the data on 2 of 2 out-of-scope questions:** financial stability (S10) and paper prices (Q09).
- **Mirrored the user's language:** Hinglish in, Hinglish out (S09, Q08).
- **Caught the ₹251 per-100 pad error unprompted in 5 answers.**
- **Never invented a budget:** it says there isn't one in the system and offers last year as a stand-in (S03, S07).

## Automated checks, calibrated against my labels

| Check | Result on 22 traces | Agreement with my labels |
|---|---|---|
| FM1 brevity request honoured | 0/2 pass (S02, S04) | 2/2 ✓ |
| FM2 no false plant caveat | 21/22 (S04) | ✓ |
| FM3 every number in a tool result | 19/22 (S09, Q01, Q13) | ✓ (the app's own number check) |
| FM6 ineligible supplier named best without caveat | 17/22 flagged 5 | **2 right (S01, and Q01, which I'd missed and have since relabelled), 2 false alarms (S03, S07: the caveat is in the next clause or sentence), 1 borderline (Q04)**. Regex sentence matching is too blunt; this mode needs an LLM judge validated against labels |
| FM7 latency ≤ 45 s / cost < $0.50 | 16/22, 18/22 | ✓ (objective) |

## What's left (needs API access)

1. **31 more traces.** Raise the Anthropic limit and run `node run-traces.mjs` in this folder; it resumes where it stopped. Cost is about $0.25–0.50 per trace.
2. ~~**Your review pass.**~~ Skipped by choice. `review.html` is there if needed later.
3. **LLM judges** for FM5 and FM6, each checked against your labels before trusting them.
4. **Apply the fixes** (FM1, FM2, FM6 and FM3 are each one prompt or tool change), then re-run the same 40 traces and compare.

## Cost

About $3.43 for the 9 new traces, plus about $0.05 to generate 40 queries (gpt-6-luna). The checks and the review app are free. No prototype file was changed.
