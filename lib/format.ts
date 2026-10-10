// Display helpers. Indian number formatting (lakh/crore) because the buyer is in India.
export const inr = (n: number | null | undefined, dp = 2) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const inrBig = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} lakh`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

export const STATUS_LABEL: Record<string, string> = {
  verified: "Checks passed",
  converted: "Converted",
  needs_review: "Needs review",
  missing: "Not quoted",
  carried: "From last year",
  confirmed: "Confirmed",
  overridden: "Corrected",
};

export const STATUS_STYLE: Record<string, string> = {
  verified: "text-[var(--bitter-900)]",
  converted: "text-[var(--bitter-900)]",
  needs_review: "bg-[var(--international-orange-50)] text-[var(--international-orange-900)] ring-1 ring-inset ring-[var(--international-orange-300)]",
  missing: "text-[var(--bitter-400)]",
  carried: "bg-[var(--amethyst-50)] text-[var(--amethyst-900)] ring-1 ring-inset ring-[var(--amethyst-200)]",
  confirmed: "bg-[var(--malachite-50)] text-[var(--malachite-900)]",
  overridden: "bg-[var(--blue-ribbon-50)] text-[var(--blue-ribbon-900)] ring-1 ring-inset ring-[var(--blue-ribbon-200)]",
};

export const STATUS_ICON: Record<string, string> = {
  verified: "",
  converted: "⇄",
  needs_review: "⚠",
  missing: "",
  carried: "↺",
  confirmed: "✓",
  overridden: "✎",
};
