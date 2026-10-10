import type { Ctx } from "./index";

/** Keep provisional review and award calculations inside the replies seen so far. */
export function receivedCtx(ctx: Ctx, ids: string[]): Ctx {
  const seen = new Set(ids);
  const keep = <T>(record: Record<string, T> | undefined) => record && Object.fromEntries(Object.entries(record).filter(([id]) => seen.has(id)));
  return {
    ...ctx,
    cells: ctx.cells.filter((cell) => seen.has(cell.vendorId)),
    terms: ctx.terms.filter((term) => seen.has(term.vendorId)),
    cleared: keep(ctx.cleared) ?? {},
    lineGate: keep(ctx.lineGate),
    capacity: keep(ctx.capacity),
  };
}
