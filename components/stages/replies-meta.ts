// How each demo reply arrived. Dates match the stored run's story (RFx sent 21 Sep, replies due 30 Sep).
export const RECEIVED: Record<string, string> = { A: "24 Sep", B: "26 Sep", C: "27 Sep", D: "29 Sep", E: "30 Sep" };
export const REPLY_SHAPE: Record<string, string> = {
  A: "Their own Excel layout, not your template",
  B: "PDF on letterhead, priced in USD, discount in a footnote",
  C: "Word document, commercials written as paragraphs",
  D: "Phone photo of a printed rate card, plus a covering email",
  E: "A short email: “₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra”",
};

/** Plain names for the file types in a reply, primary file first, attachments marked. */
export function fileKind(files: string[]): string[] {
  return files.map((f) => {
    const ext = f.split(".").pop()?.toLowerCase() ?? "";
    const kind = ext === "xlsx" || ext === "xls" || ext === "csv" ? "Excel" : ext === "pdf" ? "PDF" : ext === "docx" ? "Word" : ext === "jpg" || ext === "jpeg" || ext === "png" ? "Photo" : ext === "txt" || ext === "eml" ? "Email" : ext.toUpperCase();
    return /attachment|ISO/i.test(f) ? `${kind} certificate` : kind;
  });
}
