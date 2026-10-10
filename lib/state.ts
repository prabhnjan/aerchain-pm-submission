// Assembles the workspace state: the latest pipeline run + reference data + the buyer's overrides.
// No database in the prototype: overrides live in the browser and come with each request.
import { qualification, capacityFrom } from "@/lib/questionnaire/eligibility";
import { QUESTIONNAIRE as QUESTIONNAIRE_FOR_QUAL } from "@/data/rfx";
import runJson from "@/data/runs/latest.json";
import refJson from "@/data/reference.json";
import { LINES, BUYER, QUESTIONNAIRE, TERMS } from "@/data/rfx";
import { applyOverrides } from "@/lib/overrides";
import type { Cell, EvidenceDoc, Override } from "@/lib/pipeline/types";
import type { VendorTerms, Reference } from "@/lib/pipeline/normalise";
import type { QuestionnaireResult } from "@/lib/questionnaire";
import type { Ctx } from "@/lib/scenario";

export interface RunData {
  ranAt: string;
  vendors: Record<string, { files: string[]; extraction: { vendor_name: string; answers?: { question_id: string; answer_text: string }[] }; evidenceDocs?: EvidenceDoc[]; superseded?: { files: string[]; replacedAt: string; pricedLines: number }[] }>;
  cells: Cell[];
  terms: VendorTerms[];
  questionnaire: QuestionnaireResult[];
  aiCalls: { purpose: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; ms: number }[];
}

export const BASE_RUN = runJson as unknown as RunData;
export const REFERENCE = refJson as unknown as Reference;
export { LINES, BUYER, QUESTIONNAIRE, TERMS };

export { applyOverrides };

export function vendorName(id: string, run: RunData = BASE_RUN) {
  return run.vendors[id]?.extraction?.vendor_name || `Vendor ${id}`;
}

export function buildCtx(run: RunData, overrides: Override[]): Ctx {
  return {
    lines: LINES,
    cells: applyOverrides(run.cells, overrides),
    terms: run.terms,
    history: REFERENCE.history,
    ...qualification(run.questionnaire, QUESTIONNAIRE_FOR_QUAL), capacity: capacityFrom(run.vendors),
  };
}
