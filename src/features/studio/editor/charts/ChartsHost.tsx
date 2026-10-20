// DS-8 · what the charts and tables pieces show outside the toolbar and the
// drawers (mounted once by the editor shell, inside EditorContext):
//   - the "Big number · Tile · Chart" choice after a figure is dropped on the
//     page or clicked in the Data drawer;
//   - the custom-data grid and the static table editor dialogs.
import { useEffect, useRef } from "react";
import { ChartColumn, Hash, LayoutDashboard } from "lucide-react";
import { cn, focusRing } from "../../../../ui";
import { useEditor } from "../EditorContext";
import { TableEditorDialog } from "../tables/TableEditor";
import { elementForFigure, type DropChoice } from "./chartOps";
import { CustomDataGridDialog } from "./CustomDataGrid";
import { setChartsUi, useChartsUi } from "./store";

const CHOICES: { id: DropChoice; label: string; icon: typeof Hash }[] = [
  { id: "big_number", label: "Big number", icon: Hash },
  { id: "kpi_tile", label: "Tile", icon: LayoutDashboard },
  { id: "chart", label: "Chart", icon: ChartColumn },
];

function FigureChoice() {
  const ed = useEditor();
  const { drop } = useChartsUi();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drop) return;
    ref.current?.querySelector("button")?.focus();
    const away = (e: PointerEvent) =>
      !ref.current?.contains(e.target as Node) && setChartsUi({ drop: null });
    const esc = (e: KeyboardEvent) =>
      e.key === "Escape" && setChartsUi({ drop: null });
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [drop]);
  if (!drop) return null;
  const pick = (c: DropChoice) => {
    ed.insertElement(elementForFigure(c, drop.binding, drop.label), {
      pageId: drop.pageId,
      at: drop.at ?? undefined,
      label: `Add ${drop.label}`,
    });
    setChartsUi({ drop: null });
  };
  const left = Math.min(
    drop.client.x,
    (typeof window === "undefined" ? 1600 : window.innerWidth) - 240,
  );
  const top = Math.min(
    drop.client.y,
    (typeof window === "undefined" ? 900 : window.innerHeight) - 72,
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Add ${drop.label} as`}
      data-testid="figure-choice"
      className="fixed z-50 flex items-center gap-1 rounded-card border border-line bg-panel p-1 shadow-lg"
      style={{ left, top }}
    >
      <span className="px-2 text-xs text-muted">Add as</span>
      {CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => pick(c.id)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-ink hover:bg-tint",
            focusRing,
          )}
        >
          <c.icon aria-hidden className="size-4" />
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function ChartsHost() {
  const ed = useEditor();
  const ui = useChartsUi();
  return (
    <>
      <FigureChoice />
      {ui.grid && (
        <CustomDataGridDialog
          key={ui.grid.elementId}
          editor={ed}
          pageId={ui.grid.pageId}
          elementId={ui.grid.elementId}
          onClose={() => setChartsUi({ grid: null })}
        />
      )}
      {ui.table && (
        <TableEditorDialog
          key={ui.table.elementId}
          editor={ed}
          pageId={ui.table.pageId}
          elementId={ui.table.elementId}
          onClose={() => setChartsUi({ table: null })}
        />
      )}
    </>
  );
}
