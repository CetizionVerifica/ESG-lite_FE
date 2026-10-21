// The Chart / Table view of one panel, owned by its PanelShell (05-ux §5:
// Enter on a panel header opens its table view). Panels pass it to ChartFrame:
//   const { view, setView } = usePanelView();
//   <ChartFrame view={view} onViewChange={setView} … />
import { createContext, useContext } from "react";

export type PanelView = "chart" | "table";
export interface PanelViewState {
  view: PanelView;
  setView: (v: PanelView) => void;
}

export const PanelViewContext = createContext<PanelViewState | null>(null);

/** The panel's view; outside a PanelShell (present mode, tests) it reads `chart` and ignores changes. */
export function usePanelView(): PanelViewState {
  return useContext(PanelViewContext) ?? { view: "chart", setView: () => undefined };
}
