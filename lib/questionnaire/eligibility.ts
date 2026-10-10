// Audit F06: qualification is not one vendor boolean. Vendor-wide must-haves decide whether a
// vendor clears; line-scoped must-haves (food-safe inks) only gate the lines they apply to.
// "Unclear" or "not answered" never passes.
import type { Question } from "@/data/rfx";
import type { QuestionnaireResult } from "./index";

export interface Qualification {
  cleared: Record<string, "yes" | "no" | "not_answered">; // vendor-wide must-haves
  lineGate: Record<string, Record<string, boolean>>; // vendorId → questionId (line-scoped) → passed
}

export function qualification(results: QuestionnaireResult[], questions: Question[]): Qualification {
  const cleared: Qualification["cleared"] = {};
  const lineGate: Qualification["lineGate"] = {};
  for (const r of results) {
    const pass = (qid: string) => r.verdicts.find((v) => v.question_id === qid)?.verdict === "pass";
    const vendorWide = questions.filter((q) => q.mustHave && !q.appliesTo);
    const answered = r.verdicts.some((v) => v.verdict !== "not_answered");
    cleared[r.vendorId] = !answered ? "not_answered" : vendorWide.every((q) => pass(q.id)) ? "yes" : "no";
    lineGate[r.vendorId] = Object.fromEntries(questions.filter((q) => q.mustHave && q.appliesTo).map((q) => [q.id, pass(q.id)]));
  }
  return { cleared, lineGate };
}

/**
 * Capacity a vendor can be awarded (tonnes/month) = spare capacity ÷ 1.5, from their own answer
 * ("450 t/month, 70% utilised"). null = not stated or unreadable: never assumed to pass.
 */
export function capacityFrom(vendors: Record<string, { extraction: { answers?: { question_id: string; answer_text: string }[] } }>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [id, v] of Object.entries(vendors)) {
    const a = v.extraction.answers?.find((x) => x.question_id === "Q05")?.answer_text ?? "";
    const cap = a.match(/(\d+(?:\.\d+)?)\s*(?:t|mt|tonnes?|tons?)\b/i);
    const util = a.match(/(\d+(?:\.\d+)?)\s*%/);
    out[id] = cap && util ? Math.round(((parseFloat(cap[1]) * (1 - parseFloat(util[1]) / 100)) / 1.5) * 10) / 10 : null;
  }
  return out;
}
