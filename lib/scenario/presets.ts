import type { ScenarioRule } from "./index";

export const PRESETS: { id: string; label: string; rule: ScenarioRule }[] = [
  { id: "vp", label: "Best price for each item", rule: { rule: "cheapest_per_line", vendorFilter: "cleared_questionnaire" } },
  { id: "one", label: "One supplier for everything", rule: { rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 1 } },
  { id: "two", label: "Use one or two suppliers", rule: { rule: "max_vendors", vendorFilter: "cleared_questionnaire", maxVendors: 2 } },
  { id: "all", label: "Price-only reference", rule: { rule: "cheapest_per_line", vendorFilter: "all" } },
];
