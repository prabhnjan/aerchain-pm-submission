# Live-upload test: 4 unseen supplier replies

**Run:** 10 Oct 2026, 16:20–16:28 IST, by Claude, against the local prototype (`http://localhost:3000`, current working tree).
**Why:** Aerchain will drive the live demo and may upload their own files. The CSV path had been tested (held-out H). This test adds an **image**, a **phone photo** and an **email**, plus a fresh **CSV**. All 4 are new suppliers the system has never seen.

## Result in one line

**33 of 33 quoted prices came out right, with 0 silent errors.** Both "not quoted" lines showed as not quoted, never 0. Freight, GST basis, a conditional discount, an MOQ and short validity were all read. One email group rate was also applied to an extra line, **but it was flagged**, so it isn't silent.

## The files (all fabricated; answer key written before any upload)

| File | Supplier | What makes it hard | Answer key |
|---|---|---|---|
| `files/Lakshmi_quotation.csv` | Lakshmi Corrugated Works | Their own item names with **no buyer codes** (must match by size and ply); rates **per 100 pcs**; "Regret – capacity full" on one line; ex-works with freight ₹1.80/kg | ₹ per piece = rate ÷ 100 |
| `files/Vasavi_quotation.png` | Vasavi Packaging LLP | **Image of a table, no text layer**; footnote discount "2.5% if annual order value exceeds ₹60 lakh"; "GST 5% extra"; 7-ply line marked "Not manufactured" | As printed |
| `files/SreeBalaji_ratecard_photo.jpg` | Sree Balaji Box Makers | **Angled phone photo** (3D tilt, shadow, blur, JPEG q68, 37 KB); codes on **only half** the rows; slanted rows; MOQ in footer | As printed |
| `files/Mahalaxmi_reply.eml` | Mahalaxmi Cartons | **Prices in prose**, no codes; **inclusive of 5% GST**; freight "at actuals"; validity 15 days; "trays and pads not in our range" | Written ÷ 1.05 |

- `make-images.ts` renders the PNG and JPG (Playwright and sharp, the same tools as the original replies).
- `expected.json` is the answer key.
- `score.mjs` scores `results/*.json`. A price counts as right within 0.5% or ±₹0.02. A **silent error** is a wrong price, or a price on an unquoted line, that isn't flagged.

## Method

1. **Server path, all 4 files:** each file was posted to `/api/extract` as a new supplier "F" on top of the prepared 5-supplier run. This is the endpoint the in-app "+" (Add a reply) button calls, and nothing is mocked. The 4 ran in parallel.
2. **UI path, the photo:** in a separate browser tab, I went through **+ → choose supplier → choose file → Save** and read the result off the comparison table and the source drawer. I picked the "Unique Cartons · awaiting reply" slot on purpose, to see what happens when the file's supplier doesn't match the slot.

## Scores (server path)

| File | Time | Cost | Right | Silent errors | Not quoted shown correctly | Extra lines | Second read (photo/image) | Questionnaire |
|---|---|---|---|---|---|---|---|---|
| CSV | 59 s | $0.30 | **9/9** | 0 | 1/1 ("Regret") | 0 | n/a | not answered |
| Image | 98 s | $1.10 | **9/9** | 0 | 1/1 ("Not manufactured") | 0 | yes | "no" (see O4) |
| Photo | 86 s | $0.78 | **8/8** | 0 | – | 0 | yes | not answered |
| Email | 60 s | $0.36 | **7/7** | 0 | – | **1, flagged** | n/a | not answered |
| **Total** | 59–98 s | **$2.54** | **33/33** | **0** | 2/2 | 1 (flagged) | | |

### Terms read correctly

| File | Freight | GST basis | Other |
|---|---|---|---|
| CSV | Extra, ₹1.80/kg | Exclusive | – |
| Image | Delivered | Exclusive, 5% | 2.5% discount over ₹60 lakh annual value captured as a condition |
| Photo | Delivered | Exclusive | MOQ 1,000 pcs flagged |
| Email | Extra, amount unknown (landed cost shown as a range) | **Inclusive, 5%, converted to ex-GST** | – |

Validity periods were read where stated.

## UI path (photo, through "+")

- All 8 prices appeared in the table, correct, under the supplier name **read from the photo** ("Sree Balaji Box Makers").
- **All 8 were marked "check".** The source drawer said: *"Independent second read: Read from a photo, and the independent second read is unavailable. Check against the image."* The other checks (price matches quoted text, belongs to this line, plausible price) passed. The drawer showed the photo row it read from, enlarged.
- The header went to 6/6. The headline cards stayed honest: "Qualified rows to check 1", because the new supplier hasn't cleared quality.

## Observations

| # | Observation | Severity | Detail |
|---|---|---|---|
| **O1** | **Extraction on unseen formats is strong.** | ✅ | Per-100 rates, prices without codes matched by size and ply, a slanted phone photo with half the codes missing, and GST-inclusive prose: all exact. |
| **O2** | **A group rate spilled onto an extra line, but was flagged.** | ✅ (works as designed) | The email said "For the 5 ply detergent shippers (1 kg x 12 and 500 g x 24)… Rs 44.50 and Rs 39.75". **PK-SHP-019** (export detergent shipper, same 410×310×260 size) also got ₹42.38, flagged "Rate given for a group". The robustness test treats such values as "can't establish". PK-SHP-001 was also flagged "unit not written next to the price" (the "per box" was at the end of the sentence). That's a harmless extra flag. |
| **O3** | **The second read on a photo can fail silently on the UI path; the result is safe but noisy.** | P2 | The same photo got a working second read on the server path (8/8 passed checks) but "unavailable" through the UI (8/8 marked "check"). The code catches a failed second read and continues (`app/api/extract/route.ts`: `.catch(() => undefined)`), so values are never trusted without it. The cause wasn't captured: I had no server log access, because the dev server runs in your own terminal. **For the demo:** if a reviewer uploads a photo and every cell says "check", that's this. Opening a cell explains it. |
| **O4** | **"Failed" label for a partly answered questionnaire.** | P3 | Vasavi answered only the GSTIN (in its letterhead) and nothing else, so it shows "Failed" (`clears: "no"`). Lakshmi, Sree Balaji and Mahalaxmi answered nothing and show "No answers". Excluding Vasavi from the award is correct (unknown never passes), but "Failed" overstates it; "Incomplete" would be accurate. |
| **O5** | **Value-based discount conditions are never evaluated.** | P2 | `lib/scenario/index.ts:119–121` only understands tonnage thresholds (`/(\d+)\s*(mt\|tonne\|ton)/`). "Annual order value exceeds ₹60 lakh" is recorded and shown, but always treated as **not met**, with "0 t/mo" in the memo. That's conservative (never overstates savings), but it would miss a real saving and the memo wording is misleading. |
| **O6** | **The upload slot decides the supplier ID; the file decides the name.** | P2 | Uploading Sree Balaji's photo into the "Unique Cartons · awaiting reply" slot made column F read "Sree Balaji Box Makers". Unique Cartons quietly disappeared from the list. There's an "Another supplier · G" option for un-invited suppliers. A reviewer picking the wrong slot gets no warning that the names don't match. |
| **O7** | **The prepared demo now lists 6 suppliers with "5/6 replies"** before anything is uploaded (a new `MANUAL_SUPPLIER` "Unique Cartons", added by the parallel session during this test). | Note | Intended as the slot for a manual upload. A fresh viewer may read "5/6" as a reply that failed to arrive. |
| **O8** | **Speed and cost per upload: 59–98 s and $0.30–$1.10.** | Note for the demo | Images and photos cost more because of the second read on enlarged crops. Narrate the wait. Spend limits are set at both providers. |

## Not tested here

- PDF and Word uploads. These were tested earlier in the project, through the original 5 replies and their live re-reads.
- 2 or more uploads in one session (audit N3: an uploaded photo's image bytes aren't kept for later re-checks).
- An upload larger than the new 4 MB combined cap.
- The deployed environment (Vercel limits and cold starts).

## Side effects

- About $2.54 in model calls for the server path, plus about $0.80 for the UI photo upload [Guess].
- The browser test used a separate tab. Shared `localStorage` was restored to its previous state (`quote-desk-replies-v1 = 0`).
- A temporary local file server on port 8765 fed the test files to the browser, and was stopped afterwards.
- No prototype file was changed. New files are only in `testing/live-upload/`.
