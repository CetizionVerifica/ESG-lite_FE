import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles } from "lucide-react";
import { Button, Callout, TabPanel, Tabs, formatNumber } from "../../../ui";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import type { RowsDispatch } from "../hooks/useEntryRows";
import type { RowIssue } from "../logic/entry";
import type { FormModel } from "../logic/form";
import type { EntrySetup } from "../api";
import type { ModalRow } from "../types";
import { EntryRow, type RowComparison } from "../components/EntryRow";

type Props = {
  rows: ModalRow[];
  dispatch: RowsDispatch;
  model: FormModel;
  setup: EntrySetup;
  calc: EmissionCalculator;
  feraCalc: EmissionCalculator | null;
  issues: (RowIssue | null)[];
  comparisons: RowComparison[];
  factorYear: number;
  reportingYear: number;
  classicHref: string;
  onBack: () => void;
  onNext: () => void;
};

/** Step 2: rows typed in by hand, each with its live tCO₂e. */
export function EnterRows(p: Props) {
  const [tab, setTab] = useState<"manual" | "bill">("manual");
  const [showIssues, setShowIssues] = useState(false);
  const total = p.rows.reduce((sum, r) => sum + (p.calc.calculateEmission(r).value ?? 0), 0);
  const invalid = p.issues.filter(Boolean).length;

  const next = () => {
    if (invalid > 0) {
      setShowIssues(true);
      return;
    }
    p.onNext();
  };

  // Ctrl/⌘+Enter goes to review; Enter in a field adds a row.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) next();
    else p.dispatch({ type: "add", model: p.model });
  };

  return (
    <div className="space-y-4">
      <Tabs
        label="How to enter values"
        idBase="add-data-source"
        value={tab}
        onChange={setTab}
        items={[
          { value: "manual", label: "Type it in" },
          { value: "bill", label: <span className="inline-flex items-center gap-1">Start from a bill <Sparkles aria-hidden className="size-3.5" /></span> },
        ]}
      />

      <TabPanel idBase="add-data-source" value="bill" current={tab}>
        <Callout
          tone="brand"
          title="Reading bills is moving here next"
          action={
            <Link className="text-sm font-medium text-brand-text underline" to={p.classicHref}>
              Open the current Add data page
            </Link>
          }
        >
          Until then, upload bills on the current Add data page. It keeps the same site, category and period.
        </Callout>
      </TabPanel>

      <TabPanel idBase="add-data-source" value="manual" current={tab}>
        <div className="space-y-3" onKeyDown={onKeyDown}>
          {p.rows.map((row, i) => (
            <EntryRow
              key={row.id}
              index={i}
              row={row}
              model={p.model}
              calc={p.calc}
              feraCalc={p.feraCalc}
              factors={p.setup.factors}
              mappings={p.setup.mappings}
              units={p.setup.units}
              factorYear={p.factorYear}
              reportingYear={p.reportingYear}
              issue={p.issues[i]}
              showIssue={showIssues}
              comparison={p.comparisons[i]}
              canRemove={p.rows.length > 1}
              onChange={(column, value) => p.dispatch({ type: "change", model: p.model, id: row.id, column, value })}
              onExtraChange={(key, value) => p.dispatch({ type: "extra", id: row.id, key, value })}
              onDuplicate={() => p.dispatch({ type: "duplicate", id: row.id })}
              onRemove={() => p.dispatch({ type: "remove", id: row.id })}
            />
          ))}
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => p.dispatch({ type: "add", model: p.model })}>
            Add row
          </Button>
        </div>
      </TabPanel>

      {showIssues && invalid > 0 && (
        <Callout tone="warn" title={`${invalid} row${invalid === 1 ? " needs" : "s need"} attention`}>
          Fix the rows marked in red, then continue.
        </Callout>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-page py-3">
        <p className="text-sm text-muted">
          Total <span className="font-num text-base font-semibold text-ink">{formatNumber(total, 2)} tCO₂e</span>
          <span className="ml-2 hidden text-xs sm:inline">Ctrl+Enter to review</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={p.onBack}>
            Back
          </Button>
          <Button variant="primary" onClick={next} disabled={p.rows.length === 0}>
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}
