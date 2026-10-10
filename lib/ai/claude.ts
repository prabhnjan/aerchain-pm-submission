// All Claude calls go through here, so the model can be swapped and every call is logged.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";

export const MODELS = {
  primary: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
  secondRead: process.env.CLAUDE_SECOND_READ_MODEL ?? "claude-opus-5-5",
};

// $ per million tokens (input, output, cache read), from Anthropic's price list.
const PRICE: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
};

export interface AiCallLog {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  ms: number;
  stopReason: string | null;
}
export const callLog: AiCallLog[] = [];

let client: Anthropic | null = null;
// Keys not scoped to a workspace need the workspace id on every request.
const getClient = () =>
  (client ??= new Anthropic(
    process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } } : {},
  ));

export class ExtractionFailed extends Error {}

/** One structured-output call. Fails loudly on refusal or truncation rather than returning partial data. */
export async function structuredCall<T extends z.ZodType>(opts: {
  purpose: string;
  model?: string;
  system: string;
  content: BetaContentBlockParam[];
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const model = opts.model ?? MODELS.primary;
  const t0 = Date.now();
  const res = await getClient().beta.messages.parse(
    {
      model,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    },
    { timeout: 280_000 },
  );
  const [pin, pout, pcache] = PRICE[model] ?? [4, 20, 0.2];
  const u = res.usage;
  callLog.push({
    purpose: opts.purpose, model: res.model,
    inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0,
    costUsd: (u.input_tokens * pin + u.output_tokens * pout + (u.cache_read_input_tokens ?? 0) * pcache + (u.cache_creation_input_tokens ?? 0) * pin * 1.25) / 1e6,
    ms: Date.now() - t0, stopReason: res.stop_reason,
  });
  if (res.stop_reason === "refusal") throw new ExtractionFailed(`${opts.purpose}: model declined (${res.stop_details?.category ?? "unknown"})`);
  if (res.stop_reason === "max_tokens") throw new ExtractionFailed(`${opts.purpose}: output was cut off`);
  if (!res.parsed_output) throw new ExtractionFailed(`${opts.purpose}: output didn't match the schema`);
  return res.parsed_output as z.infer<T>;
}
