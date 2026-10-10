// The analyst: natural-language questions over the comparison.
// The model plans and explains; every number comes from a tool (code over the data),
// and a number guard checks the final answer against the tool results.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTool, BetaToolResultBlockParam, BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { MODELS, callLog } from "@/lib/ai/claude";
import { runScenario, robustness, type Ctx, type ScenarioRule } from "@/lib/scenario";
import { pieceWeightGrams, dimsLabel, round2 } from "@/lib/domain/spec";
import type { RunData } from "@/lib/state";
import { QUESTIONNAIRE } from "@/data/rfx";

export interface Artifact {
  kind: "table" | "chart";
  title: string;
  columns?: string[];
  rows?: (string | number)[][];
  chart?: { type: "bar" | "grouped_bar" | "stacked_bar"; xLabel: string; yLabel: string; data: { category: string; series: string; value: number }[] };
}
export interface TraceStep { tool: string; input: unknown; summary: string }
export interface AnalystAnswer {
  answer: string;
  artifacts: Artifact[];
  trace: TraceStep[];
  numberGuard: { checked: number; verified: number; unverified: string[] };
  costUsd: number;
}

const SYSTEM = `You are the procurement analyst inside a sourcing tool. A category buyer and their VP ask you questions about an RFQ for corrugated packaging. Use only the supplier replies present in the supplied tools. Some invited suppliers may not have replied yet.

Rules:
- Every number you state must come from a tool result in this conversation. Never compute in your head: use the calc tool for differences, percentages or sums.
- Prices are INR per piece, ex-GST. Totals are annual. Write money as ₹ with lakh/crore where natural (1 lakh = 100,000; 1 crore = 10,000,000).
- Always say what the answer depends on: vendors excluded and why, uncovered lines, unconfirmed values used, assumptions (freight, FX, conversions), conditional discounts.
- For award questions, also run the robustness check and say whether the decision holds if the uncertain values are wrong.
- If a cheaper or simpler option exists that the question didn't ask about (e.g. fewer vendors, a discount threshold), mention it briefly with numbers.
- If the data can't answer the question, say so and say what's missing. Don't guess.
- Write for a buyer using a product, not for an evaluator. Start with the direct answer or recommended next action. Use plain, conversational language in one short paragraph of 2 to 4 sentences. Include only caveats that could change the decision; put supporting detail in a second short paragraph only when needed.
- Do not use Markdown headings, bullets, bold, code blocks, raw data, tool names, JSON, calculation logs, or tables in your prose. Use make_table / make_chart for supporting data when genuinely useful. Never narrate your process or mention the assignment.`;

const T = (name: string, description: string, properties: Record<string, unknown>, required: string[]): BetaTool => ({
  name, description, strict: true,
  input_schema: { type: "object", properties, required, additionalProperties: false } as BetaTool["input_schema"],
});
const strArr = { type: "array", items: { type: "string" } };

const TOOLS: BetaTool[] = [
  T("overview", "Vendors, reply formats, lines quoted, flags, questionnaire result, and each vendor's total across the lines they quoted.", {}, []),
  T("query_cells", "Cell-level prices. Empty arrays mean 'all'. Returns quoted price, landed cost, status, reasons, and conversion steps.", {
    vendor_ids: strArr, line_ids: strArr,
    statuses: { type: "array", items: { type: "string", enum: ["verified", "converted", "needs_review", "missing", "carried", "confirmed", "overridden"] } },
  }, ["vendor_ids", "line_ids", "statuses"]),
  T("run_scenario", "Compute an award scenario in code. rule: cheapest_per_line | single_vendor | max_vendors. vendor_filter: all | cleared_questionnaire | list (then use vendor_ids). Returns per-line award, total, conditional discounts, by-vendor split, uncovered lines, last year's cost for the same lines, and (if with_robustness) which uncertain cells could change the winner.", {
    rule: { type: "string", enum: ["cheapest_per_line", "single_vendor", "max_vendors"] },
    vendor_filter: { type: "string", enum: ["all", "cleared_questionnaire", "list"] },
    vendor_ids: strArr,
    single_vendor_id: { type: "string" },
    max_vendors: { type: "integer" },
    basis: { type: "string", enum: ["landed", "quoted"] },
    exclude_unconfirmed: { type: "boolean" },
    with_robustness: { type: "boolean" },
  }, ["rule", "vendor_filter", "vendor_ids", "single_vendor_id", "max_vendors", "basis", "exclude_unconfirmed", "with_robustness"]),
  T("vendor_detail", "One vendor: commercial terms, vendor-level flags, conditional discounts, questionnaire verdicts with evidence.", { vendor_id: { type: "string" } }, ["vendor_id"]),
  T("line_detail", "One RFx line: spec, annual quantity, box weight, and every vendor's price with source quote and status.", { line_id: { type: "string" } }, ["line_id"]),
  T("calc", "Evaluate arithmetic (+ - * / parentheses, numbers only) so derived numbers are traceable.", { expression: { type: "string" } }, ["expression"]),
  T("make_table", "Show a table to the user (also exportable to Excel).", { title: { type: "string" }, columns: strArr, rows: { type: "array", items: strArr } }, ["title", "columns", "rows"]),
  T("make_chart", "Show a bar chart to the user. Values must come from tool results.", {
    title: { type: "string" },
    type: { type: "string", enum: ["bar", "grouped_bar", "stacked_bar"] },
    x_label: { type: "string" }, y_label: { type: "string" },
    data: { type: "array", items: { type: "object", properties: { category: { type: "string" }, series: { type: "string" }, value: { type: "number" } }, required: ["category", "series", "value"], additionalProperties: false } },
  }, ["title", "type", "x_label", "y_label", "data"]),
];

function safeCalc(expr: string): number {
  if (!/^[\d\s+\-*/().]+$/.test(expr)) throw new Error("Only numbers and + - * / ( ) are allowed");
  const v = Function(`"use strict"; return (${expr});`)() as number;
  if (!Number.isFinite(v)) throw new Error("Result is not a finite number");
  return round2(v * 10000) / 10000;
}

export async function ask(question: string, history: { role: "user" | "assistant"; text: string }[], ctx: Ctx, run: RunData, progress?: { received: number; expected: number }): Promise<AnalystAnswer> {
  const client = new Anthropic(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } } : {});
  const artifacts: Artifact[] = [];
  const trace: TraceStep[] = [];
  const toolOutputs: string[] = [];
  const name = (id: string) => run.vendors[id]?.extraction?.vendor_name ?? id;
  const lineOf = (id: string) => ctx.lines.find((l) => l.id === id);

  const exec = (tool: string, input: Record<string, unknown>): unknown => {
    switch (tool) {
      case "overview": {
        return [...new Set(ctx.cells.map((c) => c.vendorId))].sort().map((v) => {
          const cs = ctx.cells.filter((c) => c.vendorId === v);
          const quoted = cs.filter((c) => c.inrPerPiece != null);
          const q = run.questionnaire.find((x) => x.vendorId === v);
          return {
            vendor_id: v, name: name(v), files: run.vendors[v]?.files,
            lines_quoted: quoted.length, lines_missing: cs.length - quoted.length,
            needs_review: cs.filter((c) => c.status === "needs_review").length, carried_from_last_year: cs.filter((c) => c.status === "carried").length,
            total_quoted_lines_inr: Math.round(quoted.reduce((s, c) => s + (c.inrPerPiece as number) * lineOf(c.lineId)!.annualQty, 0)),
            questionnaire: q?.clears, failed_must_haves: q?.failedMustHaves,
            vendor_flags: run.terms.find((t) => t.vendorId === v)?.flags,
          };
        });
      }
      case "query_cells": {
        const { vendor_ids, line_ids, statuses } = input as { vendor_ids: string[]; line_ids: string[]; statuses: string[] };
        return ctx.cells
          .filter((c) => (!vendor_ids.length || vendor_ids.includes(c.vendorId)) && (!line_ids.length || line_ids.includes(c.lineId)) && (!statuses.length || statuses.includes(c.status)))
          .slice(0, 200)
          .map((c) => ({ vendor: c.vendorId, line: c.lineId, quoted_inr: c.inrPerPiece, landed_inr: c.landedPerPiece, landed_range: c.landedRange, status: c.status, reasons: c.reasons, conversion: c.conversion, as_written: c.source.asWritten }));
      }
      case "run_scenario": {
        const i = input as { rule: ScenarioRule["rule"]; vendor_filter: string; vendor_ids: string[]; single_vendor_id: string; max_vendors: number; basis: "landed" | "quoted"; exclude_unconfirmed: boolean; with_robustness: boolean };
        const rule: ScenarioRule = {
          rule: i.rule, vendorFilter: i.vendor_filter === "list" ? i.vendor_ids : (i.vendor_filter as "all" | "cleared_questionnaire"),
          vendorId: i.single_vendor_id || undefined, maxVendors: i.max_vendors || undefined, basis: i.basis, excludeUnconfirmed: i.exclude_unconfirmed,
        };
        const r = runScenario(rule, ctx);
        const rb = i.with_robustness ? robustness(rule, ctx) : null;
        return {
          ...r,
          lines: r.lines.map((a) => ({ line: a.lineId, vendor: a.vendorId, unit_inr: a.unitPrice, qty: a.annualQty, annual_inr: a.annualValue, unconfirmed: a.unconfirmed, runner_up: a.runnerUp })),
          robustness: rb && { decision_holds: rb.holds, cells_that_could_change_winner: rb.critical.filter((c) => c.couldChangeWinner === true), cells_that_cannot_be_bounded: rb.critical.filter((c) => c.couldChangeWinner === null), uncertain_cells_checked: rb.critical.length },
        };
      }
      case "vendor_detail": {
        const v = String(input.vendor_id);
        return {
          vendor_id: v, name: name(v), terms: run.terms.find((t) => t.vendorId === v),
          questionnaire: run.questionnaire.find((q) => q.vendorId === v)?.verdicts.map((x) => ({ ...x, question: QUESTIONNAIRE.find((q) => q.id === x.question_id)?.text })),
        };
      }
      case "line_detail": {
        const l = lineOf(String(input.line_id));
        if (!l) return { error: "No such line" };
        return {
          line: l.id, description: l.description, spec: `${dimsLabel(l)} mm, ${l.ply}-ply ${l.flutes}, ${l.bf} BF, GSM ${l.gsmLayers.join("/")}`, annual_qty: l.annualQty, box_weight_g: Math.round(pieceWeightGrams(l)),
          vendors: ctx.cells.filter((c) => c.lineId === l.id).map((c) => ({ vendor: c.vendorId, quoted_inr: c.inrPerPiece, landed_inr: c.landedPerPiece, landed_range: c.landedRange, status: c.status, reasons: c.reasons, source_quote: c.source.quote, source_ref: c.source.ref })),
        };
      }
      case "calc": return { expression: input.expression, result: safeCalc(String(input.expression)) };
      case "make_table": {
        artifacts.push({ kind: "table", title: String(input.title), columns: input.columns as string[], rows: input.rows as string[][] });
        return { shown: true };
      }
      case "make_chart": {
        const i = input as { title: string; type: "bar" | "grouped_bar" | "stacked_bar"; x_label: string; y_label: string; data: { category: string; series: string; value: number }[] };
        artifacts.push({ kind: "chart", title: i.title, chart: { type: i.type, xLabel: i.x_label, yLabel: i.y_label, data: i.data } });
        return { shown: true };
      }
    }
    return { error: `Unknown tool ${tool}` };
  };

  const messages: BetaMessageParam[] = [
    ...history.flatMap((h) => [{ role: h.role, content: h.text } as BetaMessageParam]),
    { role: "user", content: question },
  ];
  let answer = "";
  let cost = 0;
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    const res = await client.beta.messages.create({
      model: MODELS.primary, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: [{ type: "text", text: `${SYSTEM}${progress ? `\n\nReply progress: ${progress.received} of ${progress.expected} expected suppliers have responded. The tools include only received replies. Do not imply that unreceived suppliers have quoted, passed checks, or been compared. Any award analysis is provisional until the remaining replies arrive.` : ""}`, cache_control: { type: "ephemeral" } }],
      tools: TOOLS, tool_choice: { type: "auto" },
      output_config: { effort: "medium" },
      messages,
    });
    const u = res.usage;
    const c = (u.input_tokens * 4 + u.output_tokens * 20 + (u.cache_read_input_tokens ?? 0) * 0.2 + (u.cache_creation_input_tokens ?? 0) * 5) / 1e6;
    cost += c;
    callLog.push({ purpose: "analyst", model: res.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, costUsd: c, ms: Date.now() - t0, stopReason: res.stop_reason });
    if (res.stop_reason === "refusal") { answer = "I can't answer that one."; break; }
    const content = res.content as BetaContentBlock[];
    messages.push({ role: "assistant", content });
    const uses = content.filter((b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (!uses.length || res.stop_reason === "end_turn") {
      answer = content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
      if (!uses.length) break;
    }
    const results: BetaToolResultBlockParam[] = uses.map((u2) => {
      let out: unknown;
      try { out = exec(u2.name, u2.input as Record<string, unknown>); } catch (e) { out = { error: (e as Error).message }; }
      const json = JSON.stringify(out);
      toolOutputs.push(json);
      trace.push({ tool: u2.name, input: u2.input, summary: json.length > 300 ? json.slice(0, 300) + "…" : json });
      return { type: "tool_result", tool_use_id: u2.id, content: json, ...(typeof out === "object" && out && "error" in out ? { is_error: true } : {}) };
    });
    messages.push({ role: "user", content: results });
  }
  return { answer, artifacts, trace, numberGuard: guardNumbers(answer, toolOutputs), costUsd: round2(cost * 1000) / 1000 };
}

/** Every number in the answer must match a number in the tool outputs (allowing lakh/crore/% display). */
export function guardNumbers(answer: string, toolOutputs: string[]) {
  const known: number[] = [];
  for (const o of toolOutputs) for (const m of o.matchAll(/-?\d+(?:\.\d+)?/g)) known.push(parseFloat(m[0]));
  const text = answer.replace(/PK-[A-Z]{3}-\d{3}/g, " ").replace(/\b(19|20)\d{2}\b/g, " ");
  const found = [...text.matchAll(/(?:₹\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(crore|cr|lakhs?)\b|(%))?/gi)];
  const unverified: string[] = [];
  let checked = 0;
  for (const m of found) {
    const raw = m[1].replace(/,/g, "");
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) continue;
    if (!m[2] && !m[3] && Number.isInteger(n) && n <= 31 && !m[0].includes("₹")) continue; // small counts (lines, vendors)
    checked++;
    const dp = raw.includes(".") ? raw.split(".")[1].length : 0;
    const unit = (m[2] ?? m[3] ?? "").toLowerCase();
    const scale = unit.startsWith("cr") ? 1e7 : unit.startsWith("l") ? 1e5 : 1;
    const tol = (0.5 * Math.pow(10, -dp)) * scale + 1e-9;
    const target = n * scale;
    const ok = known.some((k) => Math.abs(k - target) <= tol || (unit === "%" && (Math.abs(k * 100 - n) <= 0.5 * Math.pow(10, -dp) || Math.abs(k - n) <= 0.5 * Math.pow(10, -dp))));
    if (!ok) unverified.push(m[0].trim());
  }
  return { checked, verified: checked - unverified.length, unverified };
}
