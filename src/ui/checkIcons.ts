import { Copy, FileSpreadsheet, Gauge, ListChecks, Paperclip, Ruler, Sigma, TrendingUp, type LucideIcon } from "lucide-react";
import type { CheckIcon } from "../lib/scope3/checks";

/** Icon per review check (S3-15); the names come from `src/lib/scope3/checks`. */
export const CHECK_ICONS: Record<CheckIcon, LucideIcon> = {
  factor: Sigma,
  unit: Ruler,
  evidence: Paperclip,
  trend: TrendingUp,
  duplicate: Copy,
  import: FileSpreadsheet,
  method: ListChecks,
  quality: Gauge,
};
