import { draftRfx, type Draft } from "@/lib/copilot";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = (await req.json()) as { messages: { role: "user" | "assistant"; text: string }[]; current: Draft["draft"] | null };
  if (!body.messages?.length) return Response.json({ error: "Say what you need" }, { status: 400 });
  try {
    return Response.json(await draftRfx(body.messages.slice(-12), body.current));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
