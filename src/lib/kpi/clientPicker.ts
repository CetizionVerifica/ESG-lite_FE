import { type ReactNode, createContext } from "react";

/** The shell's client picker, so a KPI page can offer it when a Superadmin hasn't chosen a client (D18). */
export const KpiClientPickerContext = createContext<ReactNode>(null);
