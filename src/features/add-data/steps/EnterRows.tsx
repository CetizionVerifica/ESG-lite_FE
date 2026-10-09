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
import { billOf } from "../logic/bill";
import type { EntryPeriod } from "../logic/entry";
import { rowHasInput } from "../hooks/useEntryRows";
import { FromBill } from "./FromBill";
import type { RowEvidence } from "../hooks/useRowEvidence";
import { DistanceDrawer } from "../components/distance/DistanceDrawer";
import { distanceTarget, type DistanceField } from "../logic/distance";

type Props = {
  rows: ModalRow[];
  dispatch: RowsDispatch;
  model: FormModel;
  setup: EntrySetup;
  calc: EmissionCalculator;
  feraCalc: EmissionCalculator | null;
  /** Per row of `rows`; null when the row is fine or won't be sent (an empty typed row next to bill rows). */
  issues: (RowIssue | null)[];
  /** Bills whose rows the user hasn't checked yet. */
  unconfirmedBills: number;
  siteId: number;
  categoryId: number;
  userId: number | null;
  period: EntryPeriod;
  draftKey: string | null;
  comparisons: RowComparison[];
  factorYear: number;
  reportingYear: number;
  classicHref: string;
  evidence: RowEvidence;
  onBack: () => void;
  onNext: () => void;
};

/** Step 2: rows typed in by hand, each with its live tCO₂e. */
export function EnterRows(p: Props) {
  const manualRows = p.rows.filter((r) => !billOf(r));
  const [tab, setTab] = useState<"manual" | "bill">(() =>
    p.rows.some((r) => billOf(r)) && !manualRows.some(rowHasInput) ? "bill" : "manual",
  );
  const [showIssues, setShowIssues] = useState(false);
  // Bills still being read; Review waits so their rows can't skip the check.
  const [reading, setReading] = useState(0);
  // The distance column the drawer fills, if open.
  const [distanceFor, setDistanceFor] = useState<{ rowId: ModalRow["id"]; column: string; field: DistanceField } | null>(null);
  const distanceRow = distanceFor ? p.rows.find((r) => r.id === distanceFor.rowId) : undefined;
  const total = p.rows.reduce((sum, r) => sum + (p.calc.calculateEmission(r).value ?? 0), 0);
  const invalid = p.issues.filter(Boolean).length;
  const position = new Map(p.rows.map((r, i) => [r.id, i]));

  const renderRow = (row: ModalRow, index: number, canRemove: boolean) => {
    const i = position.get(row.id) ?? 0;
    return (
      <EntryRow
        key={row.id}
        index={index}
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
        canRemove={canRemove}
        onChange={(column, value) => p.dispatch({ type: "change", model: p.model, id: row.id, column, value })}
        onExtraChange={(key, value) => p.dispatch({ type: "extra", id: row.id, key, value })}
        onDuplicate={() => p.dispatch({ type: "duplicate", id: row.id })}
        onRemove={() => p.dispatch({ type: "remove", id: row.id })}
        onCalculateDistance={(column, field) => setDistanceFor({ rowId: row.id, column, field })}
        evidence={
          billOf(row)
            ? undefined
            : {
                items: p.evidence.items[row.id] ?? [],
                onAdd: (files) => p.evidence.add(row.id, files),
                onRemove: (id) => p.evidence.remove(row.id, id),
              }
        }
      />
    );
  };

  const next = () => {
    if (invalid > 0 || p.unconfirmedBills > 0 || reading > 0) {
      setShowIssues(true);
      return;
    }
    p.onNext();
  };

  // Ctrl/⌘+Enter goes to review from either tab; Enter in a typed row's field adds a row.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT" || (e.target as HTMLInputElement).type === "file") return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      next();
    } else if (tab === "manual") {
      e.preventDefault();
      p.dispatch({ type: "add", model: p.model });
    }
  };
  // Where the rows needing attention are, so the message points at the right tab.
  const invalidIn = (fromBill: boolean) => p.rows.some((r, i) => p.issues[i] && !!billOf(r) === fromBill);

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
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

      <TabPanel idBase="add-data-source" value="bill" current={tab} keepMounted>
        <FromBill
          rows={p.rows}
          dispatch={p.dispatch}
          model={p.model}
          setup={p.setup}
          siteId={p.siteId}
          categoryId={p.categoryId}
          userId={p.userId}
          period={p.period}
          draftKey={p.draftKey}
          onReading={(delta) => setReading((n) => n + delta)}
          renderRow={(row, index) => renderRow(row, index, true)}
        />
        <p className="mt-3 text-xs text-muted">
          Bulk upload from a spreadsheet is still on the{" "}
          <Link className="font-medium text-brand-text underline" to={p.classicHref}>
            current Add data page
          </Link>
          .
        </p>
      </TabPanel>

      <TabPanel idBase="add-data-source" value="manual" current={tab}>
        <div className="space-y-3">
          {manualRows.map((row, i) => renderRow(row, i, manualRows.length > 1))}
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => p.dispatch({ type: "add", model: p.model })}>
            Add row
          </Button>
        </div>
      </TabPanel>

      {showIssues && invalid > 0 && (
        <Callout tone="warn" title={`${invalid} row${invalid === 1 ? " needs" : "s need"} attention`}>
          Fix the rows marked in red
          {invalidIn(false) && invalidIn(true) ? " in both tabs" : invalidIn(true) ? ' under "Start from a bill"' : ' under "Type it in"'}, then continue.
        </Callout>
      )}
      {showIssues && reading > 0 && (
        <Callout tone="info" title={`${reading} bill${reading === 1 ? " is" : "s are"} still being read`}>
          Wait for the rows to appear and check them before review.
        </Callout>
      )}
      {showIssues && p.unconfirmedBills > 0 && (
        <Callout tone="warn" title={`${p.unconfirmedBills} bill${p.unconfirmedBills === 1 ? " is" : "s are"} not checked yet`}>
          Under "Start from a bill", check what the AI read and choose Use these rows, or remove a bill dated outside this period. Nothing from a bill is sent before that.
        </Callout>
      )}

      <DistanceDrawer
        open={!!distanceFor && !!distanceRow}
        onClose={() => setDistanceFor(null)}
        unit={String(distanceRow?.activity_data_unit ?? "km")}
        onUse={(distance) => {
          if (distanceFor) {
            p.dispatch({ type: "change", model: p.model, id: distanceFor.rowId, column: distanceTarget(distanceFor.field, distanceFor.column), value: String(distance) });
          }
          setDistanceFor(null);
        }}
      />

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
