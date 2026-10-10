// Live re-read: runs the real pipeline for one vendor (their original files, or a newly uploaded reply)
// and returns the updated run. Other vendors keep their stored extraction.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toEvidence } from "@/lib/ingest";
import { extractReply, secondRead } from "@/lib/extract";
import { buildCells, type VendorInput } from "@/lib/pipeline/normalise";
import { judgeQuestionnaire, type QuestionnaireResult } from "@/lib/questionnaire";
import { callLog } from "@/lib/ai/claude";
import { BASE_RUN, REFERENCE, LINES, QUESTIONNAIRE, type RunData } from "@/lib/state";
import { pieceWeightGrams } from "@/lib/domain/spec";
import type { EvidenceDoc } from "@/lib/pipeline/types";
import type { ReplyExtraction } from "@/lib/extract/schema";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const REPLIES = join(process.cwd(), "data", "vendor-replies");
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4_000_000;
const MAX_FILES = 8;
const SUPPORTED = /\.(xlsx|xls|csv|pdf|docx|jpe?g|png|txt|eml)$/i;

async function originalDocs(vendorId: string): Promise<EvidenceDoc[]> {
  const files = readdirSync(REPLIES).filter((f) => f.startsWith(`${vendorId}_`));
  return Promise.all(files.map((f) => toEvidence(f, readFileSync(join(REPLIES, f)))));
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const vendorId = String(form.get("vendorId") ?? "").trim().toUpperCase().slice(0, 3);
  const runJson = String(form.get("run") ?? "");
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (Buffer.byteLength(runJson) + uploads.reduce((sum, file) => sum + file.size, 0) + 64_000 > MAX_REQUEST_BYTES) return Response.json({ error: "Reply too large. Keep all files and request data under 4 MB combined." }, { status: 413 });
  const run: RunData = runJson ? JSON.parse(runJson) : BASE_RUN;
  if (!/^[A-Z]{1,3}$/.test(vendorId)) return Response.json({ error: "Vendor id must be letters, e.g. F" }, { status: 400 });
  if (uploads.length > MAX_FILES) return Response.json({ error: `Upload at most ${MAX_FILES} files per reply` }, { status: 400 });
  if (uploads.some((f) => f.size > MAX_BYTES)) return Response.json({ error: "Each file must be under 4 MB" }, { status: 400 });
  if (uploads.some((f) => !SUPPORTED.test(f.name))) return Response.json({ error: "Supported files: Excel, CSV, PDF, Word, JPG, PNG, TXT and EML" }, { status: 400 });

  const callsBefore = callLog.length;
  const t0 = Date.now();
  try {
    let docs: EvidenceDoc[];
    if (uploads.length) {
      docs = await Promise.all(uploads.map(async (f) => {
        try { return await toEvidence(`${vendorId}_${f.name}`, Buffer.from(await f.arrayBuffer())); }
        catch (e) { throw new BadFile(f.name, e); }
      }));
    } else {
      docs = await originalDocs(vendorId);
      if (!docs.length) return Response.json({ error: `No stored files for vendor ${vendorId}; upload a reply instead` }, { status: 400 });
    }
    const hard = docs.find((d) => d.kind === "image" || d.needsSecondRead);
    const [extraction, second] = await Promise.all([
      extractReply(vendorId, docs, LINES, QUESTIONNAIRE),
      hard?.image ? secondRead(vendorId, hard, LINES, QUESTIONNAIRE).catch(() => undefined) : Promise.resolve(undefined),
    ]);

    // A file we could open but that yields no prices is a failed read, not an empty bid (audit F18).
    const priced = extraction.lines.filter((x) => x.price_value >= 0 || x.price_status === "refers_to_history").length;
    if (!priced) {
      return Response.json({ error: `Read ${docs.map((d) => d.fileName.replace(/^[A-Z]+_/, "")).join(", ")}, but found no prices for any RFx line. Nothing was changed. If this is a quote, check it's the right file, or send a clearer copy.` }, { status: 422 });
    }

    // Rebuild every vendor's cells (cross-vendor checks depend on all of them).
    const ids = [...new Set([...Object.keys(run.vendors), vendorId])].sort();
    const inputs: VendorInput[] = await Promise.all(
      ids.map(async (id) => {
        if (id === vendorId) return { vendorId: id, docs, extraction, secondRead: second };
        const stored = run.vendors[id] as unknown as { extraction: ReplyExtraction; secondRead?: ReplyExtraction; evidenceDocs?: EvidenceDoc[] };
        const d = stored.evidenceDocs ?? await originalDocs(id).catch(() => []);
        return { vendorId: id, docs: d, extraction: stored.extraction, secondRead: stored.secondRead };
      }),
    );
    const { cells, terms } = buildCells(inputs, LINES, REFERENCE);
    const tonnes = LINES.reduce((t, l) => t + (pieceWeightGrams(l) * l.annualQty) / 1e6, 0);
    // If the judge is unavailable, keep the prices and mark the questionnaire as not judged. Unknown never passes.
    const q = await judgeQuestionnaire(vendorId, extraction, docs, QUESTIONNAIRE, new Date().toISOString().slice(0, 10), tonnes)
      .catch((e) => { console.error(`Questionnaire judge failed for ${vendorId}:`, e); return notJudged(vendorId); });
    const calls = callLog.slice(callsBefore);
    const next: RunData = {
      ...run,
      ranAt: new Date().toISOString(),
      vendors: {
        ...run.vendors,
        [vendorId]: {
          files: docs.map((d) => d.fileName), extraction, ...(second ? { secondRead: second } : {}),
          ...(uploads.length ? { evidenceDocs: docs.map((doc) => ({ fileName: doc.fileName, kind: doc.kind, text: doc.text, cellMap: doc.cellMap, ocr: doc.ocr, needsSecondRead: doc.needsSecondRead })) } : {}),
          // Audit F13: a new reply supersedes the old one; keep the record of what it replaced.
          ...(run.vendors[vendorId] && uploads.length
            ? { superseded: [...(run.vendors[vendorId].superseded ?? []), { files: run.vendors[vendorId].files, replacedAt: new Date().toISOString(), pricedLines: run.cells.filter((c) => c.vendorId === vendorId && c.inrPerPiece != null).length }] }
            : run.vendors[vendorId]?.superseded ? { superseded: run.vendors[vendorId].superseded } : {}),
        } as RunData["vendors"][string],
      },
      cells, terms,
      questionnaire: [...run.questionnaire.filter((x) => x.vendorId !== vendorId), q],
      aiCalls: [...run.aiCalls, ...calls],
    };
    return Response.json({ run: next, seconds: Math.round((Date.now() - t0) / 1000), costUsd: calls.reduce((s, c) => s + c.costUsd, 0), secondRead: !!second });
  } catch (e) {
    // The browser gets a plain message; provider details (billing, outages, raw API text) stay in the server log.
    console.error(`Reply read failed for ${vendorId}:`, e);
    if (e instanceof BadFile || isBadFileError(e)) {
      const name = e instanceof BadFile ? e.fileName : uploads.map((f) => f.name).join(", ");
      return Response.json({ error: `Couldn't open ${name || "this file"}. It may be damaged, password-protected or not the format its name suggests. Nothing was changed.` }, { status: 422 });
    }
    return Response.json({ error: "Aera couldn't read this reply right now. Nothing was changed. Try again shortly." }, { status: 503 });
  }
}

class BadFile extends Error {
  constructor(public fileName: string, cause: unknown) { super(`Couldn't open ${fileName}`, { cause }); }
}

/** A provider rejecting the file itself (corrupt, unreadable) rather than failing as a service. */
function isBadFileError(e: unknown) {
  const status = (e as { status?: number })?.status;
  const msg = String((e as Error)?.message ?? "");
  return status === 400 && /badly formatted|corrupt|could not (be )?(read|process|parse)|invalid (file|image|pdf)|unsupported (file|image)/i.test(msg) && !/credit|billing|quota|balance/i.test(msg);
}

function notJudged(vendorId: string): QuestionnaireResult {
  const reason = "Couldn't be judged: the quality check was unavailable when this reply was read. Read the reply again to judge it.";
  return {
    vendorId,
    verdicts: QUESTIONNAIRE.map((q) => ({ question_id: q.id, evidence_quote: "", verdict: "unclear" as const, reason })),
    clears: "no",
    failedMustHaves: QUESTIONNAIRE.filter((q) => q.mustHave).map((q) => `${q.text}: unclear (${reason})`),
  };
}
