// Does local OCR (Tesseract, no AI) find D's prices on the angled photo, with pixel boxes?
import { createWorker } from "tesseract.js";
import sharp from "sharp";
(async () => {
  const img = await sharp("data/vendor-replies/D_ShreeAmbika_ratecard_photo.jpg").resize({ width: 2000 }).grayscale().normalize().toBuffer();
  const meta = await sharp(img).metadata();
  const w = await createWorker("eng");
  const { data } = await w.recognize(img, {}, { blocks: true });
  await w.terminate();
  const words = (data.blocks ?? []).flatMap((b: any) => b.paragraphs.flatMap((p: any) => p.lines.flatMap((l: any) => l.words)));
  const prices = words.filter((x: any) => /^\d{1,3}\.\d{2}$/.test(x.text));
  console.log(`image ${meta.width}x${meta.height}; words ${words.length}; price-like tokens ${prices.length}`);
  console.log(prices.slice(0, 30).map((x: any) => `${x.text}@y${Math.round(x.bbox.y0)}(${Math.round(x.confidence)})`).join(" "));
})();
