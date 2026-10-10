# Live-Upload Test: 4 Unseen Supplier Replies

**Run:** 10 Oct 2026 (AI-assisted), against the prototype's real upload path.
**Why:** a live demo can include files the system has never seen. This test uploads 4 new replies in different formats and scores every price against an answer key written before any upload.

## Result

**33 of 33 quoted prices came out right, with 0 silent errors** (wrong and unflagged). Both "not quoted" lines showed as not quoted, never 0. Freight, GST basis, a conditional discount, an MOQ and validity were read. One group rate also landed on an extra line, but it was flagged.

## The files

All are fabricated and in [`live-upload-files/`](live-upload-files/); the answer key is [`live-upload-files/expected.json`](live-upload-files/expected.json). You can upload them yourself with **+** (Add a reply) on the comparison.

| File | What makes it hard | Answer key |
|---|---|---|
| `Lakshmi_quotation.csv` | Their own item names with no buyer codes (match by size and ply); rates per 100 pcs; "Regret" on one line; ex-works with freight ₹1.80/kg | ₹ per piece = rate ÷ 100 |
| `Vasavi_quotation.png` | Image of a table with no text layer; footnote discount "2.5% if annual order value exceeds ₹60 lakh"; GST 5% extra; one line "Not manufactured" | As printed |
| `SreeBalaji_ratecard_photo.jpg` | Angled phone photo (tilt, shadow, blur); codes on only half the rows | As printed |
| `Mahalaxmi_reply.eml` | Prices in prose with no codes; inclusive of 5% GST; freight "at actuals"; 15-day validity | Written ÷ 1.05 |

A price counts as right within 0.5% (or ±₹0.02).

## Scores

| File | Time | Right | Silent errors | Not quoted shown correctly | Extra lines |
|---|---|---|---|---|---|
| CSV | 59 s | **9/9** | 0 | 1/1 | 0 |
| Image | 98 s | **9/9** | 0 | 1/1 | 0 |
| Photo | 86 s | **8/8** | 0 | – | 0 |
| Email | 60 s | **7/7** | 0 | – | 1, flagged |
| **Total** | 59–98 s | **33/33** | **0** | 2/2 | 1 (flagged) |

Terms read correctly: CSV freight extra ₹1.80/kg, ex-GST. Image delivered, GST 5% extra, the 2.5% discount captured as a condition. Photo delivered, GST extra, MOQ 1,000 flagged. Email freight extra with the amount unknown (landed cost shown as a range), GST-inclusive prices converted to ex-GST.

## Observations

| # | Observation | Severity |
|---|---|---|
| O1 | Extraction on unseen formats is strong: per-100 rates, prices without codes, a slanted photo with half the codes missing, and GST-inclusive prose were all exact | ✅ |
| O2 | The email said "For the 5 ply detergent shippers (1 kg x 12 and 500 g x 24)… Rs 44.50 and Rs 39.75". The export detergent shipper (same size) also got that price, **flagged** "rate given for a group", so it can't pass quietly | ✅ by design |
| O3 | If the second read of a photo fails (for example, the model provider is unavailable), every photo price is marked "check" rather than trusted. Safe, but noisy | P2 |
| O4 | A supplier that answered only 1 must-have shows "Failed" quality. Excluding it is right (unknown never passes), but "Incomplete" would be the clearer label | P3 |
| O5 | Discount conditions on value ("annual order value over ₹60 lakh") are recorded but never applied; only tonnage conditions are evaluated. Conservative, never overstates savings | P2 |
| O6 | When uploading, the chosen slot sets the supplier ID and the file sets the name; uploading one supplier's file into another's slot gives no warning | P2 |
| O7 | 59–98 s and $0.30–$1.10 per upload; images and photos cost more because of the second read | Note |

Not covered here: PDF and Word uploads (covered by the 5 prepared replies and their live re-reads), and 2 or more uploads in one session.
