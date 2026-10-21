// Test helper: a chart theme with readable names instead of colours, so
// option tests can assert which token a mark uses.
import type { ChartTheme } from "../../../theme";

export const testTheme = {
  color: ["series-1", "series-2"],
  tooltip: { backgroundColor: "panel" },
  scopes: { s1: "s1", s2: "s2", s3: "s3" },
  pillars: { environment: "pillar-e", social: "pillar-s", governance: "pillar-g" },
  status: { good: "good", goodSoft: "good-soft", warn: "warn", warnSoft: "warn-soft", bad: "bad", badSoft: "bad-soft", info: "info", infoSoft: "info-soft" },
  heat: ["heat-1", "heat-2", "heat-3", "heat-4", "heat-5"],
  onHeat: ["on-heat-1", "on-heat-2", "on-heat-3", "on-heat-4", "on-heat-5"],
  ui: { ink: "ink", muted: "muted", line: "line", panel: "panel", tint: "tint", brand: "brand", onBrand: "on-brand", accent: "accent" },
} as unknown as ChartTheme;
