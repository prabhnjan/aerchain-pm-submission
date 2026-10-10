// Judges each vendor's questionnaire answers (and attachments, e.g. certificates) against the
// buyer's pass rules. AI reasoning, but every verdict must quote its evidence, and "unclear"
// is allowed: an unclear must-have means the vendor does NOT clear.
import { z } from "zod";
import { structuredCall } from "@/lib/ai/claude";
import type { Question } from "@/data/rfx";
import type { EvidenceDoc } from "@/lib/pipeline/types";
import type { ReplyExtraction } from "@/lib/extract/schema";

export const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      question_id: z.string(),
      evidence_quote: z.string().describe("Exact text from the answer or attachment the verdict rests on; empty if none"),
      verdict: z.enum(["pass", "fail", "unclear", "not_answered"]),
      reason: z.string().describe("One plain sentence"),
    }),
  ),
});
export type QuestionnaireVerdicts = z.infer<typeof VerdictSchema>["verdicts"];

export interface QuestionnaireResult {
  vendorId: string;
  verdicts: QuestionnaireVerdicts;
  clears: "yes" | "no" | "not_answered";
  failedMustHaves: string[]; // plain words
}

export async function judgeQuestionnaire(
  vendorId: string,
  extraction: ReplyExtraction,
  docs: EvidenceDoc[],
  questions: Question[],
  awardDate: string,
  annualTonnes: number,
): Promise<QuestionnaireResult> {
  const answered = extraction.answers.filter((a) => a.answer_text.trim());
  let verdicts: QuestionnaireVerdicts;
  if (!answered.length) {
    verdicts = questions.map((q) => ({ question_id: q.id, evidence_quote: "", verdict: "not_answered" as const, reason: "No answer in the reply" }));
  } else {
    const attachments = docs.filter((d) => /attach|certificate|iso/i.test(d.fileName)).map((d) => `--- ${d.fileName} ---\n${d.text}`).join("\n");
    const res = await structuredCall({
      purpose: `questionnaire:${vendorId}`,
      system: `You check a supplier's questionnaire answers against the buyer's pass rules, as an auditor. Judge only from the answers and attached documents given. Check attached certificates for validity on the award date. If evidence is missing or contradictory, say "unclear", never assume. Quote the exact evidence.`,
      schema: VerdictSchema,
      effort: "medium",
      content: [
        {
          type: "text",
          text: `Award date: ${awardDate}. Volume to be awarded if this vendor wins everything: about ${Math.round(annualTonnes / 12)} tonnes/month.\n\nQuestions and pass rules:\n${questions
            .map((q) => `${q.id} [${q.mustHave ? "MUST-HAVE" : "scored"}] ${q.text}${q.passRule ? ` | pass rule: ${q.passRule}` : ""}`)
            .join("\n")}\n\nSupplier answers:\n${extraction.answers.map((a) => `${a.question_id}: ${a.answer_text || "(no answer)"}`).join("\n")}\n\nAttached documents:\n${attachments || "(none)"}`,
        },
      ],
    });
    verdicts = res.verdicts;
  }
  const failed = questions
    .filter((q) => q.mustHave)
    .map((q) => ({ q, v: verdicts.find((x) => x.question_id === q.id) }))
    .filter(({ v }) => !v || v.verdict !== "pass")
    .map(({ q, v }) => `${q.text}: ${v ? `${v.verdict} (${v.reason})` : "no verdict"}`);
  const clears = !answered.length ? "not_answered" : failed.length ? "no" : "yes";
  return { vendorId, verdicts, clears, failedMustHaves: failed };
}
