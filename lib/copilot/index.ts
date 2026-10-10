// RFx co-pilot: turns a buyer's conversation into a structured RFx draft, and asks for what's missing.
import { z } from "zod";
import { openaiStructuredCall } from "@/lib/ai/openai";

export const DraftSchema = z.object({
  reply: z.string().describe("Your short message to the buyer: what you drafted and the 1-3 most important questions still open"),
  draft: z.object({
    title: z.string(),
    scope: z.string(),
    lines: z.array(z.object({
      id: z.string(), description: z.string(), style: z.string(),
      inner_dims_mm: z.string().describe("LxWxH or LxW; empty if unknown"),
      ply: z.number(), bf: z.number(), gsm_layers: z.string().describe("top first, e.g. 180/150/150/150/180; empty if unknown"),
      print_colours: z.number(), annual_qty: z.number(),
      unit: z.string().describe("Unit the price must be quoted in, e.g. per piece"),
    })),
    questionnaire: z.array(z.object({ question: z.string(), must_have: z.boolean(), pass_rule: z.string() })),
    terms: z.array(z.string()),
    open_questions: z.array(z.string()).describe("What the buyer still needs to decide or confirm"),
  }),
});
export type Draft = z.infer<typeof DraftSchema>;

const SYSTEM = `You are an RFQ co-pilot for an Indian procurement team. From the buyer's conversation, draft a complete RFQ: scope, line items, a supplier quality questionnaire with must-have pass rules, and commercial terms.
Rules:
- Pin down everything that later makes quotes hard to compare: the unit to quote in (per piece), currency (INR), ex-GST, delivered vs ex-works, dimensions (inner, mm), ply, BF, GSM per layer, annual quantity.
- Don't invent specs the buyer didn't give: leave a field empty or 0 and add it to open_questions.
- Treat the current draft as the buyer's prepared brief. Preserve its existing lines, questionnaire and terms exactly unless the buyer explicitly changes them.
- Limit open_questions to at most three essential blockers to issuing this RFx. Do not turn optional improvements into blockers; mention those briefly in the reply instead.
- If the prepared brief is complete enough to issue, use an empty open_questions array. Keep the reply short.`;

export async function draftRfx(messages: { role: "user" | "assistant"; text: string }[], current: Draft["draft"] | null) {
  const transcript = messages.map((m) => `${m.role === "user" ? "Buyer" : "Co-pilot"}: ${m.text}`).join("\n");
  return openaiStructuredCall({
    purpose: "copilot",
    system: SYSTEM,
    schema: DraftSchema,
    effort: "low",
    content: [{ type: "input_text", text: `Current draft (JSON, may be empty):\n${current ? JSON.stringify(current) : "{}"}\n\nConversation:\n${transcript}` }],
  });
}
