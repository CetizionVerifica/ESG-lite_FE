// DS-8 · registers the charts and tables pieces with the editor shell
// (called from editor/plugins.ts): the Charts and Data drawers, the chart and
// table toolbars, and what a figure dropped from the Data drawer does.
import { ChartsPanel } from "../../panels/ChartsPanel";
import { registerFigureDrop } from "../dnd";
import { registerDrawer, registerToolbar } from "../registry";
import { TableToolbar } from "../tables/TableToolbar";
import { ChartToolbar } from "./ChartToolbar";
import { rebind } from "./chartOps";
import { ChartsDataDrawer } from "./DataDrawer";
import { setChartsUi } from "./store";

export function registerChartsPlugins(): void {
  registerDrawer("charts", ChartsPanel);
  registerDrawer("data", ChartsDataDrawer);
  registerToolbar("chart", ChartToolbar);
  registerToolbar("table", TableToolbar);
  registerFigureDrop(({ editor, pageId, at, client, target, figure }) => {
    if (editor.readOnly) return;
    if (target) {
      const next = rebind(editor.doc, pageId, target.id, figure.binding);
      if (next !== editor.doc) editor.commit(next, `Show ${figure.label}`, { select: [target.id], pageId });
      return;
    }
    setChartsUi({ drop: { pageId, at, client, binding: figure.binding, label: figure.label } });
  });
}
