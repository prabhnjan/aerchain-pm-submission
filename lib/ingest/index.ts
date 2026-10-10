// Format adapters: any vendor file → EvidenceDoc. A new format only needs a new branch here.
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { EvidenceDoc } from "@/lib/pipeline/types";

export async function toEvidence(fileName: string, bytes: Buffer): Promise<EvidenceDoc> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return fromSpreadsheet(fileName, bytes);
  if (ext === "docx") return fromDocx(fileName, bytes);
  if (ext === "pdf") return fromPdf(fileName, bytes);
  if (ext === "jpg" || ext === "jpeg" || ext === "png") {
    return {
      fileName, kind: "image", text: "", needsSecondRead: true,
      image: { base64: bytes.toString("base64"), mediaType: ext === "png" ? "image/png" : "image/jpeg" },
    };
  }
  if (ext === "txt" || ext === "eml") return fromText(fileName, bytes.toString("utf8"));
  throw new Error(`Can't read .${ext} files yet. Supported: xlsx, csv, docx, pdf, jpg, png, txt, eml.`);
}

/** Every non-empty cell, addressed, row by row: "Quotation!I7: 45.54". */
function fromSpreadsheet(fileName: string, bytes: Buffer): EvidenceDoc {
  const wb = XLSX.read(bytes, { type: "buffer" });
  const cellMap: Record<string, string> = {};
  const out: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws["!ref"]) continue;
    out.push(`=== Sheet: ${sheetName} ===`);
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const parts: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell || cell.v === undefined || cell.v === "") continue;
        const shown = String(cell.w ?? cell.v);
        cellMap[`${sheetName}!${addr}`] = shown;
        parts.push(`${addr}=${shown}`);
      }
      if (parts.length) out.push(`[${sheetName} row ${r + 1}] ${parts.join(" | ")}`);
    }
  }
  return { fileName, kind: "text", text: out.join("\n"), cellMap, needsSecondRead: false };
}

async function fromDocx(fileName: string, bytes: Buffer): Promise<EvidenceDoc> {
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  const paras = value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return { fileName, kind: "text", text: paras.map((p, i) => `¶${i + 1}: ${p}`).join("\n"), needsSecondRead: false };
}

async function fromPdf(fileName: string, bytes: Buffer): Promise<EvidenceDoc> {
  let text = "";
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    text = (pages as string[]).map((t, i) => `=== Page ${i + 1} ===\n${t}`).join("\n");
  } catch {
    text = "";
  }
  // A PDF with almost no text layer is a scan: treat it like a photo.
  const scanned = text.replace(/=== Page \d+ ===/g, "").trim().length < 50;
  return { fileName, kind: "pdf", text, pdfBase64: bytes.toString("base64"), needsSecondRead: scanned };
}

function fromText(fileName: string, raw: string): EvidenceDoc {
  const lines = raw.split(/\r?\n/);
  return { fileName, kind: "text", text: lines.map((l, i) => `L${i + 1}: ${l}`).join("\n"), needsSecondRead: false };
}
