// Local OCR (Tesseract, no AI) for photos: word-level PIXEL boxes (audit F15).
// Weak on angled photos (it misreads many digits), so it is used only as positive evidence:
// an exact match adds "OCR agrees" and a pixel box; OCR missing a price never raises a flag.
import sharp from "sharp";

export interface OcrToken { text: string; value: number; box: [number, number, number, number]; conf: number } // box as fractions x0,y0,x1,y1

export async function ocrPrices(imageBase64: string): Promise<OcrToken[]> {
  const { createWorker } = await import("tesseract.js");
  const src = Buffer.from(imageBase64, "base64");
  const img = await sharp(src).resize({ width: 2000 }).grayscale().normalize().toBuffer();
  const { width = 1, height = 1 } = await sharp(img).metadata();
  const w = await createWorker("eng");
  try {
    const { data } = await w.recognize(img, {}, { blocks: true });
    type Word = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
    const words: Word[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words as unknown as Word[])));
    return words
      .filter((x) => /^\d{1,4}\.\d{1,3}$/.test(x.text))
      .map((x) => ({ text: x.text, value: parseFloat(x.text), conf: x.confidence, box: [x.bbox.x0 / width, x.bbox.y0 / height, x.bbox.x1 / width, x.bbox.y1 / height] as [number, number, number, number] }));
  } finally {
    await w.terminate();
  }
}
