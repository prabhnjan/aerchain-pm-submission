// Renders data/truth/truth.json into the 5 messy vendor replies (+ attachments).
// Run after build-truth: npx tsx data/generate/render-replies.ts → data/vendor-replies/
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType } from "docx";
import { chromium } from "playwright";
import sharp from "sharp";
import { LINES, BUYER, QUESTIONNAIRE } from "../rfx";
import { dimsLabel, pieceWeightGrams } from "../../lib/domain/spec";
import type { Truth, TruthCell, VendorId } from "../truth/types";

const OUT = join(__dirname, "..", "vendor-replies");
mkdirSync(OUT, { recursive: true });
const truth: Truth = JSON.parse(readFileSync(join(__dirname, "..", "truth", "truth.json"), "utf8"));
const cell = (v: VendorId, id: string) => truth.cells.find((c) => c.vendorId === v && c.lineId === id) as TruthCell;
const vendor = (v: VendorId) => truth.vendors.find((x) => x.id === v)!;
const answers = (v: VendorId) => vendor(v).answers.map((a) => ({ q: QUESTIONNAIRE.find((q) => q.id === a.questionId)!.text, a: a.answer ?? "" }));
const inch = (mm: number) => (mm / 25.4).toFixed(1);

// ---------------- A: Excel, own layout, ignores the buyer's template ----------------
function renderA() {
  const v = vendor("A");
  const rows: (string | number | null)[][] = [
    [v.name.toUpperCase()],
    ["Plot 41, Bommasandra Industrial Area, Bengaluru 560099 | GSTIN 29AAKCS4471M1Z2"],
    [],
    [`QUOTATION No. SVC/Q/26-27/212   Date: 24-09-2026   To: ${BUYER.company}, ${BUYER.plant}   Ref: your ${BUYER.rfxId}`],
    [],
    ["Sr", "Item Code", "Description", "Size LxWxH (inch)", "Ply", "BF", "GSM (T/F/M/F/B)", "Wt (gm)", "Rate (Rs)", "Unit", "Remarks"],
  ];
  let sr = 1;
  for (const l of LINES) {
    const c = cell("A", l.id);
    if (c.state === "missing") continue;
    const size = l.heightMm ? `${inch(l.lengthMm)} x ${inch(l.widthMm)} x ${inch(l.heightMm)}` : `${inch(l.lengthMm)} x ${inch(l.widthMm)}`;
    const wt = Math.round(pieceWeightGrams(l) * (0.98 + ((sr * 7) % 5) / 100)); // vendor's own weight calc, close to spec
    const unit = c.native!.basis === "per_100" ? (c.native!.basisStated ? "per 100 nos" : "") : "per pc";
    rows.push([sr++, l.id, l.description, size, l.ply, l.bf, l.gsmLayers.join("/"), wt, c.native!.value, unit, l.printColours ? `${l.printColours} col flexo` : "plain"]);
  }
  rows.push([], ["Note: Die-cut trays (PDQ, juice tray, crash-lock) not quoted. We do not have die-cutting in house."]);
  rows.push([], ["TERMS"], ["1. GST 12% extra."], ["2. Delivery FOR your Hosur plant."], ["3. Payment 45 days from invoice."], ["4. Validity 30 days. Prices subject to kraft paper variation beyond ±5%."], ["5. Bundles of 25, strapped."]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } }];
  ws["!cols"] = [4, 12, 38, 18, 5, 5, 18, 8, 10, 12, 14].map((wch) => ({ wch }));
  const comp = XLSX.utils.aoa_to_sheet([["Vendor compliance details"], [], ["Question", "Our answer"], ...answers("A").map((x) => [x.q, x.a])]);
  comp["!cols"] = [{ wch: 70 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quotation");
  XLSX.utils.book_append_sheet(wb, comp, "Compliance");
  XLSX.writeFile(wb, join(OUT, "A_SriVenkatesha_quotation.xlsx"));
}

// ---------------- HTML helpers for PDF and photo ----------------
const css = `body{font-family:Georgia,serif;font-size:11px;color:#111;margin:28px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:3px 5px;text-align:left}th{background:#eee}.r{text-align:right}`;

async function renderPdf(page: import("playwright").Page, html: string, file: string) {
  await page.setContent(`<html><head><style>${css}</style></head><body>${html}</body></html>`);
  await page.pdf({ path: join(OUT, file), format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
}

// ---------------- B: letterhead PDF, USD, discount in a footnote ----------------
function htmlB() {
  const v = vendor("B");
  const rows = LINES.map((l, i) => {
    const c = cell("B", l.id);
    return `<tr><td>${i + 1}</td><td>${l.id}</td><td>${l.description}</td><td>${dimsLabel(l)} mm, ${l.ply}-ply ${l.flutes}, ${l.bf} BF</td><td class="r">${c.native!.value.toFixed(3)}*</td></tr>`;
  }).join("");
  return `
  <div style="border-bottom:3px solid #1b5e20;padding-bottom:6px;margin-bottom:10px">
    <div style="font-size:20px;color:#1b5e20;font-weight:bold">KAVERI PACKTECH LLP</div>
    <div>An export-oriented unit | SIPCOT Phase II, Hosur 635109, Tamil Nadu | GSTIN 33AAJFK2208P1ZB | FSC-COC certified</div>
  </div>
  <p>Ref: KPT/SAHY/2609-07 &nbsp;&nbsp; Date: 26 September 2026</p>
  <p>To<br/>The Category Buyer (Packaging)<br/>${BUYER.company}, ${BUYER.plant}</p>
  <p><b>Sub: Quotation against ${BUYER.rfxId}, corrugated packaging FY 2026-27</b></p>
  <p>Dear Sir/Madam,<br/>Thank you for your enquiry. As an export-oriented unit, our prices are quoted in US Dollars. INR invoices will be raised at the RBI reference rate on the date of dispatch.</p>
  <table><tr><th>#</th><th>Your code</th><th>Description</th><th>Specification</th><th class="r">Unit price (USD/pc)</th></tr>${rows}</table>
  <p><b>Commercial terms</b></p>
  <ol><li>Delivery: FOR Hosur plant.</li><li>Payment: 60 days.</li><li>GST 5% extra as applicable.</li><li>Validity: 30 days from date of quotation.</li><li>Lead time: 7 days from PO for repeat items.</li></ol>
  <p>Assuring you of our best services,<br/>For Kaveri Packtech LLP<br/><br/>Authorised Signatory</p>
  <p style="font-size:7.5px;color:#555;margin-top:18px">* Prices are before a special discount of 3% on all line items, applicable for a monthly offtake above 5 MT. Discount will be passed through a quarterly credit note.</p>
  <div style="page-break-before:always"></div>
  <p><b>Annexure: Vendor questionnaire</b></p>
  <table><tr><th>Question</th><th>Response</th></tr>${answers("B").map((x) => `<tr><td>${x.q}</td><td>${x.a}</td></tr>`).join("")}</table>`;
}

// ---------------- certificates (attachments) ----------------
function htmlCert(company: string, number: string, validTill: string) {
  return `<div style="border:6px double #234;padding:40px;text-align:center;margin-top:60px">
    <div style="font-size:12px;letter-spacing:3px">CERTIFICATE OF REGISTRATION</div>
    <div style="font-size:24px;margin:16px 0">ISO 9001:2015</div>
    <div>This is to certify that the Quality Management System of</div>
    <div style="font-size:18px;font-weight:bold;margin:10px 0">${company}</div>
    <div>has been assessed and found to conform to ISO 9001:2015 for the scope:</div>
    <div style="margin:8px 0"><i>Manufacture and supply of corrugated boxes and packaging materials</i></div>
    <div style="margin-top:24px">Certificate No. ${number}</div>
    <div>Valid until: <b>${validTill}</b></div>
    <div style="margin-top:30px;font-size:9px;color:#666">Issued by: Assured Quality Certifications Pvt Ltd (fictional, for demo)</div></div>`;
}

// ---------------- C: Word doc, commercials in prose ----------------
async function renderC() {
  const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })], spacing: { after: 120 } });
  const header = new TableRow({ children: ["Code", "Item", "Rate (Rs./pc)"].map((t) => new TableCell({ children: [p(t, true)] })) });
  const rows = LINES.map((l) => {
    const c = cell("C", l.id);
    return new TableRow({ children: [l.id, l.description, c.native!.value.toFixed(2)].map((t, i) => new TableCell({ children: [new Paragraph({ children: [new TextRun(t)], alignment: i === 2 ? AlignmentType.RIGHT : AlignmentType.LEFT })] })) });
  });
  const doc = new Document({
    sections: [{
      children: [
        p("MEENAKSHI BOX INDUSTRIES", true),
        p("No. 112, 3rd Phase, Peenya Industrial Area, Bengaluru 560058"),
        p("Date: 27/09/2026"),
        p(`To: ${BUYER.company}, ${BUYER.plant}`),
        p(`Sub: Our best rates for your enquiry ${BUYER.rfxId}`),
        p("Respected Sir,"),
        p("With reference to your enquiry, we are pleased to quote our best rates for the corrugated boxes as per your specification. We have been supplying FMCG customers in Bengaluru for over 20 years and assure you of good quality and timely delivery."),
        new Table({ rows: [header, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } }),
        p(""),
        p("Regarding commercials, kindly note that the above rates are ex-works Peenya and freight to your Hosur plant will be charged extra at actuals, which works out to approximately Rs. 2.10 per kg as per present diesel rates. GST is extra as applicable. Our payment terms are 30 days from the date of invoice, and since kraft paper prices are moving every week these rates are valid for 7 days only. For printed items, a one-time printing plate charge of Rs. 4,500 per colour will apply, and for the die-cut items die charges of Rs. 18,000 per item are extra, payable with the first PO."),
        p("Please note that for item PK-SHP-001 and PK-SHP-004 we have considered top and bottom liner of 150 GSM instead of 180 GSM mentioned in your specification, as the 180 GSM paper is presently not available with our mills. Bursting strength will be maintained as per your requirement."),
        p("Regarding your questionnaire:", true),
        ...answers("C").map((x) => p(`${x.q}: ${x.a || "(will share separately)"}`)),
        p("Thanking you and awaiting your valued order,"),
        p("For Meenakshi Box Industries"),
        p("R. Meenakshi Sundaram, Proprietor"),
      ],
    }],
  });
  writeFileSync(join(OUT, "C_Meenakshi_quotation.docx"), await Packer.toBuffer(doc));
}

// ---------------- D: photo of a printed rate card, at an angle ----------------
function htmlD() {
  const rows = LINES.filter((l) => cell("D", l.id).state !== "missing").map((l, i) => {
    const c = cell("D", l.id);
    const price = c.native!.value.toFixed(2);
    const smudged = c.trapIds.includes("T11");
    // smudge sits over the last digit
    const shown = smudged
      ? `${price.slice(0, -1)}<span style="position:relative">${price.slice(-1)}<span style="position:absolute;left:-3px;top:-2px;width:13px;height:16px;border-radius:50%;background:rgba(70,60,40,.55);filter:blur(2.2px)"></span></span>`
      : price;
    return `<tr><td>${i + 1}</td><td>${c.vendorLineName}</td><td class="r">${shown}</td></tr>`;
  }).join("");
  return `<div id="card" style="width:560px;background:#fbf8ef;padding:22px 26px;box-shadow:0 8px 30px rgba(0,0,0,.45);font-family:'Courier New',monospace;font-size:13px">
    <div style="text-align:center;font-weight:bold;font-size:17px">SHREE AMBIKA CARTONS</div>
    <div style="text-align:center;font-size:11px">Dabaspet Industrial Area, Nelamangala Tq. Ph: 98450 XXXXX</div>
    <div style="text-align:center;margin:8px 0;text-decoration:underline">RATE LIST - CORRUGATED BOXES - SEPT 2026</div>
    <div style="font-size:11px;margin-bottom:6px">For: Sahyadri Consumer Products, Hosur</div>
    <table style="border-collapse:collapse;width:100%"><tr><th style="border:1px solid #444">S.No</th><th style="border:1px solid #444">Item</th><th style="border:1px solid #444">Rate/Pc (Rs)</th></tr>${rows.replaceAll("<td", '<td style="border:1px solid #444;padding:2px 5px"')}</table>
    <div style="font-size:11px;margin-top:8px">* Door delivery Hosur. GST extra. Trays, partitions, pads not in this list.</div>
    <div style="font-size:11px;margin-top:14px;text-align:right">for Shree Ambika Cartons</div></div>`;
}

async function renderD(page: import("playwright").Page) {
  await page.setViewportSize({ width: 1000, height: 1250 });
  await page.setContent(`<html><body style="margin:0;background:radial-gradient(circle at 30% 20%,#7b6a55,#3e3427);height:1250px;display:flex;align-items:center;justify-content:center;perspective:1100px">
    <div style="transform:rotateX(24deg) rotateZ(-6deg) rotateY(9deg);transform-origin:center">${htmlD()}</div></body></html>`);
  const png = await page.screenshot({ type: "png" });
  await sharp(png)
    .blur(0.7)
    .modulate({ brightness: 0.93, saturation: 0.85 })
    .gamma(1.15)
    .jpeg({ quality: 62 })
    .toFile(join(OUT, "D_ShreeAmbika_ratecard_photo.jpg"));
}

// ---------------- emails ----------------
function emailD() {
  return `From: Shree Ambika Cartons <sales@ambikacartons.example>
To: packaging.buyer@sahyadri-consumer.example
Date: Tue, 29 Sep 2026 18:42 +0530
Subject: Re: ${BUYER.rfxId} - rates
Attachments: rate_list.jpg, ISO_certificate.pdf

Sir, PFA our rate list photo. Printer not working so took photo.

Your questions:
${answers("D").map((x) => `- ${x.q}: ${x.a || "-"}`).join("\n")}

Regards
Ravi, Shree Ambika Cartons
`;
}

function emailE() {
  return `From: Navkar Packaging Solutions <sales@navkarpack.example>
To: packaging.buyer@sahyadri-consumer.example
Date: Wed, 30 Sep 2026 21:15 +0530
Subject: Re: ${BUYER.rfxId}

₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra.

Mahavir Jain
Navkar Packaging Solutions, Jigani
Sent from my phone
`;
}

async function main() {
  renderA();
  await renderC();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await renderPdf(page, htmlB(), "B_KaveriPacktech_quotation.pdf");
  await renderPdf(page, htmlCert("Kaveri Packtech LLP", "AQC/QMS/7781/22", "15 January 2028"), "B_attachment_ISO9001.pdf");
  await renderPdf(page, htmlCert("Sri Venkatesha Corrugators Pvt Ltd", "AQC/QMS/6120/21", "31 August 2027"), "A_attachment_ISO9001.pdf");
  await renderPdf(page, htmlCert("Shree Ambika Cartons", "AQC/QMS/5034/20", "31 March 2026"), "D_attachment_ISO9001.pdf");
  await renderD(page);
  await browser.close();
  writeFileSync(join(OUT, "D_ShreeAmbika_email.txt"), emailD());
  writeFileSync(join(OUT, "E_Navkar_email.txt"), emailE());
  console.log("Rendered vendor replies to", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
