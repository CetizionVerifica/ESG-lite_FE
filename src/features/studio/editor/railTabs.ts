// DS-6 · the rail tabs: label and icon per drawer (05-ux order).
import { BarChart3, Database, FileStack, LayoutTemplate, Palette, Shapes, Sparkles, Type, Upload, type LucideIcon } from "lucide-react";
import type { DrawerId } from "./state";

export const RAIL_TABS: Record<DrawerId, { label: string; icon: LucideIcon }> = {
  templates: { label: "Templates", icon: LayoutTemplate },
  elements: { label: "Elements", icon: Shapes },
  text: { label: "Text", icon: Type },
  brand: { label: "Brand", icon: Palette },
  uploads: { label: "Uploads", icon: Upload },
  data: { label: "Data", icon: Database },
  charts: { label: "Charts", icon: BarChart3 },
  ai: { label: "AI", icon: Sparkles },
  pages: { label: "Pages", icon: FileStack },
};

