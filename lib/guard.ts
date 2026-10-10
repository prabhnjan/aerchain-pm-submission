// Spend protection for the public demo link: optional passcode + a simple per-instance rate limit.
const hits = new Map<string, number[]>();

export function guard(req: Request): Response | null {
  const code = process.env.DEMO_PASSCODE;
  if (code && req.headers.get("x-demo-passcode") !== code) {
    return Response.json({ error: "Passcode required" }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 12) return Response.json({ error: "Too many requests; wait a minute" }, { status: 429 });
  hits.set(ip, [...recent, now]);
  return null;
}
