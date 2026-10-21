// IN-8 · Where a panel is drawn: the page, present mode (large type, top three
// cards) or the print route (static, SVG). Panels read it to size themselves.
import { createContext, useContext } from "react";

export type InsightsSurface = "page" | "present" | "print";
export const InsightsSurfaceContext = createContext<InsightsSurface>("page");
export const useInsightsSurface = () => useContext(InsightsSurfaceContext);
