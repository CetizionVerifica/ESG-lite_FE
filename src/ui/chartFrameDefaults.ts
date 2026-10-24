import { createContext } from "react";

/**
 * Overrides for every ChartFrame below it: a larger `height` (present mode),
 * the SVG renderer and no animation (print).
 */
export const ChartFrameDefaults = createContext<{ height?: number; renderer?: "canvas" | "svg"; static?: boolean }>({});

