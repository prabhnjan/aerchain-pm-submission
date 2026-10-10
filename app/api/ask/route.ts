// The analyst endpoint. Stateless: the browser sends the question, prior turns and its overrides.
import { ask } from "@/lib/analyst";
import { BASE_RUN, buildCtx, type RunData } from "@/lib/state";
import type { Override } from "@/lib/pipeline/types";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = (await req.json()) as { question: string; history?: { role: "user" | "assistant"; text: string }[]; overrides?: Override[]; run?: RunData; receivedVendorIds?: string[]; expectedVendorCount?: number };
  if (!body.question?.trim()) return Response.json({ error: "Ask a question" }, { status: 400 });
  const fullRun = body.run ?? BASE_RUN;
  const partial = Array.isArray(body.receivedVendorIds);
  const received = new Set(partial ? body.receivedVendorIds!.filter((id) => typeof id === "string" && Object.hasOwn(fullRun.vendors, id)) : []);
  const run: RunData = partial ? {
    ...fullRun,
    vendors: Object.fromEntries(Object.entries(fullRun.vendors).filter(([id]) => received.has(id))),
    cells: fullRun.cells.filter((cell) => received.has(cell.vendorId)),
    terms: fullRun.terms.filter((term) => received.has(term.vendorId)),
    questionnaire: fullRun.questionnaire.filter((item) => received.has(item.vendorId)),
  } : fullRun;
  const overrides = partial ? (body.overrides ?? []).filter((item) => received.has(item.vendorId)) : body.overrides ?? [];
  const ctx = buildCtx(run, overrides);
  try {
    const result = await ask(body.question.slice(0, 2000), (body.history ?? []).slice(-6), ctx, run, partial ? { received: received.size, expected: Math.max(received.size, Number(body.expectedVendorCount) || received.size) } : undefined);
    if (!result.answer.trim()) throw new Error("Analyst returned an empty answer");
    return Response.json(result);
  } catch (e) {
    console.error("Analyst request failed:", e);
    return Response.json({ error: "Aera can't answer that question right now. Please try again shortly." }, { status: 503 });
  }
}
