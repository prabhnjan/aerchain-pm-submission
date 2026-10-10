// Corrugated box spec maths. Used by the demo-data generator and by normalisation
// (converting per-kg quotes to per-box). Formulas: research/domain-corrugated.md §2.

export type BoxStyle = "RSC" | "Die-cut tray" | "Die-cut" | "Partition" | "Pad";
export type Flute = "B" | "C" | "E";

export interface LineSpec {
  id: string;
  description: string;
  style: BoxStyle;
  lengthMm: number;
  widthMm: number;
  heightMm: number; // 0 for pads
  ply: 3 | 5 | 7;
  flutes: string; // e.g. "BC" for 5-ply; one letter per fluted layer
  bf: number;
  gsmLayers: number[]; // top liner first
  printColours: number;
  annualQty: number;
  partitionCells?: [number, number]; // rows x cols, partitions only
  foodContact?: boolean; // packs food: line-scoped quality rules apply
}

// Flute take-up factors: C about 1.44 (US EPA); B, E estimated.
export const FLUTE_TAKE_UP: Record<Flute, number> = { B: 1.35, C: 1.45, E: 1.25 };

/** Combined board grammage: liners + fluted mediums x take-up factor. */
export function boardGsm(spec: Pick<LineSpec, "flutes" | "gsmLayers">): number {
  let total = 0;
  let fluteIndex = 0;
  spec.gsmLayers.forEach((gsm, i) => {
    if (i % 2 === 1) {
      const flute = spec.flutes[fluteIndex++] as Flute;
      total += gsm * FLUTE_TAKE_UP[flute];
    } else {
      total += gsm;
    }
  });
  return total;
}

/** Board area of one piece in m². Allowances are plant-specific estimates. */
export function blankAreaM2(spec: LineSpec): number {
  const { style, lengthMm: L, widthMm: W, heightMm: H } = spec;
  switch (style) {
    case "RSC":
      return ((2 * (L + W) + 35 + 10) * (H + W + 15)) / 1e6;
    case "Die-cut tray":
      return ((L + 2 * H + 30) * (W + 2 * H + 30)) / 1e6;
    case "Die-cut":
      return ((2 * (L + W) + 35) * (H + W * 1.3 + 20)) / 1e6;
    case "Partition": {
      const [rows, cols] = spec.partitionCells ?? [2, 2];
      return ((rows - 1) * L * H + (cols - 1) * W * H) / 1e6;
    }
    case "Pad":
      return (L * W) / 1e6;
  }
}

/** Weight of one piece in grams, from the buyer's spec. */
export function pieceWeightGrams(spec: LineSpec): number {
  return blankAreaM2(spec) * boardGsm(spec);
}

export function dimsLabel(spec: LineSpec): string {
  return spec.heightMm
    ? `${spec.lengthMm}x${spec.widthMm}x${spec.heightMm}`
    : `${spec.lengthMm}x${spec.widthMm}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
