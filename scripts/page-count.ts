// Renders a Markdown note to an A4 PDF (11pt, 18mm margins) and reports the page count (playbook step 10).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const md = readFileSync(process.argv[2], "utf8");
const inline = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
const html = md.split(/\n{2,}/).map((b) => {
  if (b.startsWith("# ")) return `<h1>${inline(b.slice(2))}</h1>`;
  const lines = b.split("\n");
  if (lines.every((l) => /^(\d+\.|-) /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^(\d+\.|-) /, ""))}</li>`).join("")}</ul>`;
  if (lines.length > 1 && /^(\d+\.|-) /.test(lines[1])) return `<p>${inline(lines[0])}</p><ul>${lines.slice(1).map((l) => `<li>${inline(l.replace(/^(\d+\.|-) /, ""))}</li>`).join("")}</ul>`;
  return `<p>${inline(b)}</p>`;
}).join("\n");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(`<html><body style="font-family:Georgia,serif;font-size:11pt;line-height:1.35">${html}</body></html>`);
  const pdf = await p.pdf({ format: "A4", margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" } });
  await b.close();
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(`${process.argv[2]}: ${pages} page(s) at 11pt A4`);
})();
