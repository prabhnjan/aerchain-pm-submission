"use client";
// Fetch helper for the browser: adds the demo passcode if the server asks for one.
const KEY = "quote-desk-passcode";

export async function api<T>(path: string, body: unknown | FormData): Promise<T> {
  const send = (code: string | null) =>
    fetch(path, {
      method: "POST",
      headers: { ...(body instanceof FormData ? {} : { "content-type": "application/json" }), ...(code ? { "x-demo-passcode": code } : {}) },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  let code: string | null = null;
  try { code = localStorage.getItem(KEY); } catch { /* ignore */ }
  let res = await send(code);
  if (res.status === 401) {
    code = window.prompt("This demo is protected to cap AI spend. Enter the passcode:");
    if (!code) throw new Error("Passcode required");
    try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
    res = await send(code);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}
