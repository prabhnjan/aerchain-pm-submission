"use client";
// Renders a bar chart from computed rows with vega-embed. Data comes only from the artifact.
import { useEffect, useRef } from "react";
import type { Artifact } from "@/lib/analyst";

export default function Chart({ chart }: { chart: NonNullable<Artifact["chart"]> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let view: { finalize: () => void } | null = null;
    const multi = new Set(chart.data.map((d) => d.series)).size > 1;
    const spec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container", height: 260,
      data: { values: chart.data },
      mark: { type: "bar", tooltip: true },
      encoding: {
        x: { field: "category", type: "nominal", title: chart.xLabel, axis: { labelAngle: -30 } },
        y: { field: "value", type: "quantitative", title: chart.yLabel, ...(chart.type === "stacked_bar" ? { stack: "zero" } : { stack: null }) },
        ...(multi ? { color: { field: "series", type: "nominal", title: null } } : {}),
        ...(multi && chart.type === "grouped_bar" ? { xOffset: { field: "series" } } : {}),
      },
    };
    import("vega-embed").then(({ default: embed }) =>
      embed(ref.current!, spec as never, { actions: false }).then((r) => { view = r; }).catch(() => { if (ref.current) ref.current.textContent = "Chart failed to render"; }),
    );
    return () => view?.finalize();
  }, [chart]);
  return <div ref={ref} className="w-full" />;
}
