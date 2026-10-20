// DS-8 · the chart toolbar (05-ux, mockup Editor): Edit data · Chart kind ▾ ·
// Colours · Labels ▾ · Top n ▾ · Grey prior year · Suggest a title, plus the
// title, subtitle and caption. Every change is one history step.
import { Database, Palette, Sparkles, Table2, Type } from "lucide-react";
import type { Binding, Element } from "../../../../lib/studio/contracts";
import { updateProps } from "../../../../lib/studio/docOps";
import { Menu, Popover, TextField, Tooltip } from "../../../../ui";
import type { ToolbarProps } from "../registry";
import { TbButton } from "../toolbars";
import { ChartKindPicker } from "./ChartKindPicker";
import {
  hasPriorYears,
  setKind,
  setOptions,
  setTop,
  takesTop,
  type ChartOptions,
} from "./chartOps";
import { setChartsUi, titleSuggester, useChartsUi } from "./store";

const TOPS = [3, 5, 6, 8, 10, 12, 15];

export function ChartToolbar({ pageId, elements, editor }: ToolbarProps) {
  useChartsUi(); // re-render when DS-9 registers the title suggester
  const el = elements[0] as Extract<Element, { type: "chart" }> | undefined;
  if (!el || el.type !== "chart") return null;
  const locked = editor.readOnly || !!el.locked;
  const p = el.props;
  const b = p.binding as Binding;
  const o = p.options ?? {};
  const opt = (patch: Partial<ChartOptions>, label: string) =>
    editor.commit(setOptions(editor.doc, pageId, el.id, patch), label);
  const custom = b.source === "custom";
  const suggest = titleSuggester();
  if (locked)
    return (
      <span className="px-2 text-sm text-muted">
        Locked. Unlock it to change the chart.
      </span>
    );

  return (
    <div
      className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap [&_button]:whitespace-nowrap"
      data-testid="chart-tools"
    >
      {custom ? (
        <TbButton
          icon={<Table2 aria-hidden className="size-4" />}
          onClick={() => setChartsUi({ grid: { pageId, elementId: el.id } })}
        >
          Edit data
        </TbButton>
      ) : (
        <TbButton
          icon={<Database aria-hidden className="size-4" />}
          onClick={() => editor.openDrawer("data")}
          data-testid="chart-edit-data"
        >
          Edit data
        </TbButton>
      )}
      <ChartKindPicker
        kind={p.kind}
        binding={b}
        onPick={(k) =>
          editor.commit(
            setKind(editor.doc, pageId, [el.id], k),
            `Chart kind: ${k.replace(/_/g, " ")}`,
          )
        }
      />
      <Menu
        label="Colours"
        trigger={(t) => (
          <TbButton {...t} icon={<Palette aria-hidden className="size-4" />}>
            Colours
          </TbButton>
        )}
        items={[
          {
            label: "Scope colours",
            checked: o.colors !== "brand",
            onSelect: () => opt({ colors: undefined }, "Scope colours"),
          },
          {
            label: "Brand colours",
            checked: o.colors === "brand",
            onSelect: () => opt({ colors: "brand" }, "Brand colours"),
          },
        ]}
      />
      <Menu
        label="Labels"
        trigger={(t) => <TbButton {...t}>Labels ▾</TbButton>}
        items={[
          {
            label: "Values",
            checked: o.showValues !== false,
            onSelect: () =>
              opt(
                { showValues: o.showValues === false ? undefined : false },
                o.showValues === false ? "Show values" : "Hide values",
              ),
          },
          {
            label: "Legend",
            checked: o.showLegend !== false,
            onSelect: () =>
              opt(
                { showLegend: o.showLegend === false ? undefined : false },
                o.showLegend === false ? "Show legend" : "Hide legend",
              ),
          },
          ...(p.kind === "scope_split"
            ? [
                { kind: "separator" as const },
                {
                  label: "Scope 2 basis note",
                  checked: o.basisNote !== false,
                  onSelect: () =>
                    opt(
                      { basisNote: o.basisNote === false ? undefined : false },
                      "Scope 2 basis note",
                    ),
                },
                {
                  label: "100 % bar",
                  checked: o.variant !== "donut",
                  onSelect: () =>
                    opt({ variant: undefined }, "Scope split as a bar"),
                },
                {
                  label: "Donut",
                  checked: o.variant === "donut",
                  onSelect: () =>
                    opt({ variant: "donut" }, "Scope split as a donut"),
                },
              ]
            : []),
          ...(["bar", "stacked_bar"].includes(p.kind)
            ? [
                { kind: "separator" as const },
                {
                  label: "Horizontal bars",
                  checked: !!o.horizontal,
                  onSelect: () =>
                    opt(
                      { horizontal: o.horizontal ? undefined : true },
                      "Bar direction",
                    ),
                },
              ]
            : []),
        ]}
      />
      {takesTop(b) && b.source === "ghg" && (
        <Menu
          label="Top n"
          trigger={(t) => (
            <TbButton {...t} data-testid="chart-top">
              {b.top ? `Top ${b.top}` : "All"} ▾
            </TbButton>
          )}
          items={[
            {
              label: "All",
              checked: !b.top,
              onSelect: () =>
                editor.commit(
                  setTop(editor.doc, pageId, el.id, undefined),
                  "Show all",
                ),
            },
            ...TOPS.map((n) => ({
              label: `Top ${n}`,
              checked: b.top === n,
              onSelect: () =>
                editor.commit(setTop(editor.doc, pageId, el.id, n), `Top ${n}`),
            })),
          ]}
        />
      )}
      <Tooltip
        content={
          hasPriorYears(b)
            ? "Earlier years in grey, this year in colour"
            : "Show more than one year (Edit data) to compare years"
        }
      >
        <TbButton
          active={o.greyPrior !== false && hasPriorYears(b)}
          disabled={!hasPriorYears(b)}
          onClick={() =>
            opt(
              { greyPrior: o.greyPrior === false ? true : false },
              "Grey prior years",
            )
          }
          data-testid="chart-grey-prior"
        >
          Grey prior year
        </TbButton>
      </Tooltip>
      <Popover
        label="Title and caption"
        trigger={(t) => (
          <TbButton {...t} icon={<Type aria-hidden className="size-4" />}>
            Title
          </TbButton>
        )}
      >
        {() => (
          <div className="w-72 space-y-2 p-1">
            <TextField
              label="Title (say the takeaway)"
              value={p.title ?? ""}
              onChange={(v) =>
                editor.commit(
                  updateProps(editor.doc, pageId, [el.id], "chart", {
                    title: v || undefined,
                  }),
                  "Chart title",
                  { mergeKey: `ctitle:${el.id}` },
                )
              }
            />
            <TextField
              label="Subtitle"
              value={p.subtitle ?? ""}
              onChange={(v) =>
                editor.commit(
                  updateProps(editor.doc, pageId, [el.id], "chart", {
                    subtitle: v || undefined,
                  }),
                  "Chart subtitle",
                  { mergeKey: `csub:${el.id}` },
                )
              }
            />
            <TextField
              label="Caption or source"
              value={p.caption ?? ""}
              onChange={(v) =>
                editor.commit(
                  updateProps(editor.doc, pageId, [el.id], "chart", {
                    caption: v || undefined,
                  }),
                  "Chart caption",
                  { mergeKey: `ccap:${el.id}` },
                )
              }
            />
          </div>
        )}
      </Popover>
      <Tooltip
        content={
          suggest
            ? "Suggest a title that states the takeaway"
            : "Title suggestions arrive with the AI assistant"
        }
      >
        <TbButton
          icon={<Sparkles aria-hidden className="size-4" />}
          disabled={!suggest || custom}
          onClick={() =>
            suggest?.({ docId: editor.docId, pageId, elementId: el.id })
          }
        >
          Suggest a title
        </TbButton>
      </Tooltip>
    </div>
  );
}
