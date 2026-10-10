// OpenAI calls (primary reader when AI_PROVIDER=openai). Same contract as lib/ai/claude.ts:
// schema-validated output, loud failure on truncation/refusal, every call logged with cost.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { z } from "zod";
import { callLog } from "./claude";
import { ExtractionFailed } from "./claude";

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-6.1-sol";

// $ per million tokens (input, output, cached input). Secondary sources; verify on OpenAI's pricing page.
const PRICE: Record<string, [number, number, number]> = {
  "gpt-6.1-sol": [2, 10, 0.2],
  "gpt-6-sol": [2, 10, 0.2],
  "gpt-6-luna": [0.1, 0.5, 0.01],
};

let client: OpenAI | null = null;
const getClient = () => (client ??= new OpenAI());

export async function openaiStructuredCall<T extends z.ZodType>(opts: {
  purpose: string;
  model?: string;
  system: string;
  content: ResponseInputContent[];
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const model = opts.model ?? OPENAI_MODEL;
  const t0 = Date.now();
  const res = await getClient().responses.parse(
    {
      model,
      instructions: opts.system,
      input: [{ role: "user", content: opts.content }],
      text: { format: zodTextFormat(opts.schema, "reply") },
      reasoning: { effort: opts.effort ?? "medium" },
      max_output_tokens: opts.maxTokens ?? 32000,
      store: false,
    },
    { timeout: 280_000 },
  );
  const [pin, pout, pcache] = PRICE[model] ?? [2, 10, 0.2];
  const u = res.usage;
  const cached = u?.input_tokens_details?.cached_tokens ?? 0;
  callLog.push({
    purpose: opts.purpose, model,
    inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0, cacheReadTokens: cached,
    costUsd: (((u?.input_tokens ?? 0) - cached) * pin + cached * pcache + (u?.output_tokens ?? 0) * pout) / 1e6,
    ms: Date.now() - t0, stopReason: res.status ?? null,
  });
  if (res.status === "incomplete") throw new ExtractionFailed(`${opts.purpose}: output incomplete (${res.incomplete_details?.reason ?? "unknown"})`);
  if (!res.output_parsed) throw new ExtractionFailed(`${opts.purpose}: no parsed output (refused or schema mismatch)`);
  return res.output_parsed as z.infer<T>;
}
