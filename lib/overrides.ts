// Applies the buyer's confirmations and corrections to cells. Shared by server and browser.
import { round2 } from "@/lib/domain/spec";
import type { Cell, Override } from "@/lib/pipeline/types";

export function applyOverrides(cells: Cell[], overrides: Override[]): Cell[] {
  return cells.map((c) => {
    const o = [...overrides].reverse().find((x) => x.vendorId === c.vendorId && x.lineId === c.lineId);
    if (!o) return c;
    if (o.action === "confirm") {
      return { ...c, status: "confirmed", override: { action: "confirm", note: o.note, by: "Buyer", at: o.at, previous: c.inrPerPiece } };
    }
    const v = o.value ?? c.inrPerPiece ?? 0;
    const extra = c.landedPerPiece != null && c.inrPerPiece != null ? c.landedPerPiece - c.inrPerPiece : 0;
    return {
      ...c, status: "overridden", inrPerPiece: round2(v),
      landedPerPiece: c.landedRange ? null : round2(v + extra),
      landedRange: c.landedRange
        ? ([round2(c.landedRange[0] - (c.inrPerPiece ?? 0) + v), round2(c.landedRange[1] - (c.inrPerPiece ?? 0) + v)] as [number, number])
        : undefined,
      override: { action: "correct", value: v, note: o.note, by: "Buyer", at: o.at, previous: c.inrPerPiece },
    };
  });
}
