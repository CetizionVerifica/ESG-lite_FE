// DS-8 · the Data drawer (replaces DS-6's registration; DS-2's DataPanel
// inside). On top of the DS-2 list:
//   - with one bound element selected, the binding editor shows above the
//     list and a clicked figure replaces that element's binding;
//   - with typed data selected, a note and "Edit table" (the custom grid);
//   - rows drag onto the page (DND_DATA): on empty page the editor asks
//     "Big number · Tile · Chart", on a data element the binding is replaced;
//   - a click with nothing selected asks the same question by the row.
import { useRef, useState } from "react";
import { Table2, Unlink } from "lucide-react";
import type {
  Binding,
  DataItem,
  GhgBinding,
  KpiBinding,
} from "../../../../lib/studio/contracts";
import { Button, Callout } from "../../../../ui";
import { DataPanel } from "../../panels/DataPanel";
import { DND_DATA } from "../dnd";
import type { DrawerProps } from "../registry";
import { scopeOf } from "../renderInputs";
import { BindingEditor } from "./BindingEditor";
import { BOUND_TYPES, elementTitle, rebind } from "./chartOps";
import { setChartsUi } from "./store";

export function ChartsDataDrawer({ docId, editor }: DrawerProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const pageId = editor.page?.id ?? "";
  const single = editor.selected.length === 1 ? editor.selected[0] : null;
  const binding =
    single && BOUND_TYPES.has(single.type)
      ? ((single.props as { binding?: Binding }).binding ?? null)
      : null;
  const bound =
    single &&
    binding &&
    (binding.source === "ghg" || binding.source === "kpi") &&
    dismissed !== single.id
      ? single
      : null;
  const custom = single && binding?.source === "custom" ? single : null;

  const onInsert = (b: GhgBinding | KpiBinding, item: DataItem) => {
    if (editor.readOnly || !editor.page) return;
    if (bound) {
      editor.commit(
        rebind(editor.doc, pageId, bound.id, b),
        `Show ${item.label}`,
      );
      return;
    }
    setChartsUi({
      drop: {
        pageId,
        at: null,
        client: last.current,
        binding: b,
        label: item.label,
      },
    });
  };

  return (
    <div
      className="space-y-3"
      onPointerDownCapture={(e) =>
        (last.current = { x: e.clientX, y: e.clientY })
      }
    >
      {bound && (
        <BindingEditor
          editor={editor}
          pageId={pageId}
          el={bound}
          onDone={() => setDismissed(bound.id)}
        />
      )}
      {custom && (
        <Callout
          tone="warn"
          icon={Unlink}
          title={`${elementTitle(custom)}: typed data`}
        >
          <p className="text-xs">
            This {custom.type} shows numbers typed into the report, not approved
            data. It is marked "Unlinked data" in the editor and listed in
            checks.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            icon={<Table2 aria-hidden className="size-4" />}
            onClick={() =>
              setChartsUi({ grid: { pageId, elementId: custom.id } })
            }
          >
            Edit table
          </Button>
        </Callout>
      )}
      <div>
        <DataPanel
          scope={scopeOf(editor.doc)}
          docId={docId}
          onInsert={onInsert}
          onDragItem={(e, b, item) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData(
              DND_DATA,
              JSON.stringify({ binding: b, label: item.label }),
            );
          }}
        />
      </div>
    </div>
  );
}
