// Stage 2: read a vendor's reply (one or more files) into structured claims.
import sharp from "sharp";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { structuredCall, MODELS } from "@/lib/ai/claude";
import { openaiStructuredCall } from "@/lib/ai/openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { ReplySchema, type ReplyExtraction } from "./schema";
import { EXTRACT_SYSTEM, rfxContext } from "./prompt";
import type { EvidenceDoc } from "@/lib/pipeline/types";
import type { LineSpec } from "@/lib/domain/spec";
import type { Question } from "@/data/rfx";

function blocksFor(doc: EvidenceDoc): BetaContentBlockParam[] {
  const label: BetaContentBlockParam = { type: "text", text: `--- File: ${doc.fileName} ---` };
  if (doc.kind === "pdf" && doc.pdfBase64) {
    return [label, { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.pdfBase64 } }];
  }
  if (doc.kind === "image" && doc.image) {
    return [label, { type: "image", source: { type: "base64", media_type: doc.image.mediaType, data: doc.image.base64 } }];
  }
  return [label, { type: "text", text: doc.text }];
}

/** Same content, in the OpenAI Responses API's shape. */
function openaiBlocksFor(doc: EvidenceDoc): ResponseInputContent[] {
  const label: ResponseInputContent = { type: "input_text", text: `--- File: ${doc.fileName} ---` };
  if (doc.kind === "pdf" && doc.pdfBase64) {
    return [label, { type: "input_file", filename: doc.fileName, file_data: `data:application/pdf;base64,${doc.pdfBase64}` }];
  }
  if (doc.kind === "image" && doc.image) {
    return [label, { type: "input_image", detail: "high", image_url: `data:${doc.image.mediaType};base64,${doc.image.base64}` }];
  }
  return [label, { type: "input_text", text: doc.text }];
}

/** Which provider does the first read. Set AI_PROVIDER=openai|anthropic. */
export const FIRST_READER = (process.env.AI_PROVIDER ?? "openai") as "openai" | "anthropic";

/** First read: the primary model reads every file the vendor sent. */
export async function extractReply(vendorLabel: string, docs: EvidenceDoc[], lines: LineSpec[], questions: Question[]): Promise<ReplyExtraction> {
  const hasImage = docs.some((d) => d.kind === "image");
  if (FIRST_READER === "openai") {
    return openaiStructuredCall({
      purpose: `extract:${vendorLabel}`,
      system: EXTRACT_SYSTEM,
      schema: ReplySchema,
      effort: hasImage ? "high" : "medium",
      content: [
        { type: "input_text", text: rfxContext(lines, questions) },
        { type: "input_text", text: `Reply from vendor ${vendorLabel}:` },
        ...docs.flatMap(openaiBlocksFor),
      ],
    });
  }
  return structuredCall({
    purpose: `extract:${vendorLabel}`,
    system: EXTRACT_SYSTEM,
    schema: ReplySchema,
    effort: hasImage ? "high" : "medium",
    content: [
      { type: "text", text: rfxContext(lines, questions), cache_control: { type: "ephemeral" } },
      { type: "text", text: `Reply from vendor ${vendorLabel}:` },
      ...docs.flatMap(blocksFor),
    ],
  });
}

/**
 * Second read for hard inputs (photos, scans): the auditor model (Claude) on a different view
 * (two overlapping crops, enlarged), so it doesn't simply repeat the first read's mistakes.
 */
export async function secondRead(vendorLabel: string, doc: EvidenceDoc, lines: LineSpec[], questions: Question[]): Promise<ReplyExtraction> {
  if (!doc.image) throw new Error("secondRead needs an image");
  const img = sharp(Buffer.from(doc.image.base64, "base64"));
  const { width = 1000, height = 1000 } = await img.metadata();
  const crop = async (top: number, h: number) =>
    (await sharp(Buffer.from(doc.image!.base64, "base64"))
      .extract({ left: 0, top: Math.round(top), width, height: Math.round(h) })
      .resize({ width: Math.min(1600, width * 1.6) })
      .sharpen()
      .jpeg({ quality: 90 })
      .toBuffer()).toString("base64");
  const [upper, lower] = await Promise.all([crop(0, height * 0.6), crop(height * 0.4, height * 0.6)]);
  return structuredCall({
    purpose: `second-read:${vendorLabel}`,
    model: MODELS.secondRead,
    system: EXTRACT_SYSTEM + "\n\nYou are given two overlapping, enlarged crops of the same photo (upper and lower part). Rows in the overlap appear in both; record each RFx line once.",
    schema: ReplySchema,
    effort: "high",
    content: [
      { type: "text", text: rfxContext(lines, questions) },
      { type: "text", text: `Photo from vendor ${vendorLabel}, upper crop:` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: upper } },
      { type: "text", text: "Lower crop:" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: lower } },
    ],
  });
}
