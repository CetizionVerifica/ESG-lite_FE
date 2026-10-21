// IN-5 · The bridge's data (GET /insights/bridge). It has no slot of its own:
// it lives in the pathway slot behind the "Pathway | What moved" toggle.
import type { InsightsQuery } from "../../../lib/insights/contracts";
import { usePanel } from "../api";

/** `enabled: false` keeps it from loading until the toggle shows it. */
export const useBridge = (query: InsightsQuery, opts: { enabled?: boolean } = {}) => usePanel("bridge", query, opts);
