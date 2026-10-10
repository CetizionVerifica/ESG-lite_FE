import { useMemo, useState } from "react";
import { Button, Drawer, Modal, Stepper } from "../../../ui";
import { errorMessage, useImportFactors, useReAnalyze, useReadSheet } from "../api";
import {
  type CategoryMap,
  type Columns,
  type ImportRow,
  type JobResult,
  type ParseResult,
  type Target,
  detectedColumns,
  distinctYears,
  groupsOf,
  initialMap,
  needsValueColumn,
  parseSimpleRows,
  planUpload,
  previewRows,
  rowProblem,
  rowsFromParse,
  schemaOverride,
} from "../importLogic";
import { type Category, type Company, type Site, categoriesFor } from "../logic";
import { LayoutStep, MapStep, type Mode, PreviewStep, ResultStep, UploadStep } from "./ImportSteps";

type StepId = "upload" | "layout" | "map" | "preview" | "result";
const STEP_LABEL: Record<StepId, { label: string; description: string }> = {
  upload: { label: "Upload", description: "Target and sheet" },
  layout: { label: "Check layout", description: "Sheet and columns" },
  map: { label: "Map to categories", description: "One per group" },
  preview: { label: "Preview", description: "Check and edit rows" },
  result: { label: "Result", description: "What was saved" },
};
const FLOW: Record<Mode, StepId[]> = { simple: ["upload", "preview", "result"], ai: ["upload", "layout", "map", "preview", "result"] };

type Props = {
  onClose: () => void;
  sites: Site[];
  companies: Company[];
  categories: Category[];
  /** Client, site and category from the page filters. */
  defaults: { clientId: number | null; siteId: number | null; categoryId: number | null };
};

/** First sheet of a workbook as header-keyed rows (simple sheets only). */
async function readFirstSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const first = wb.SheetNames[0];
  return first ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]) : [];
}

/**
 * Import factors, one entry point for every kind of sheet. Simple sheets:
 * Upload → Preview → Result, read in the browser. Anything else: Upload →
 * Check layout → Map to categories → Preview → Result, read by the AI
 * service. Mount it fresh for each import.
 */
export function ImportDrawer({ onClose, sites, companies, categories, defaults }: Props) {
  const [mode, setMode] = useState<Mode>("simple");
  const [step, setStep] = useState<StepId>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readingSimple, setReadingSimple] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);

  const [clientId, setClientId] = useState<number | null>(defaults.clientId ?? sites.find((s) => s.site_id === defaults.siteId)?.company?.company_id ?? null);
  const [targetValue, setTargetValue] = useState<string | null>(defaults.siteId ? String(defaults.siteId) : null);
  const [map, setMap] = useState<CategoryMap>({ "": defaults.categoryId });

  // AI path
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [columns, setColumns] = useState<Columns>({ name: null, value: null, unit: null, source: null });
  const read = useReadSheet();
  const reAnalyze = useReAnalyze();

  const [filter, setFilter] = useState<{ group: string | null; year: number | null; q: string }>({ group: null, year: null, q: "" });
  const [touched, setTouched] = useState<Partial<Record<StepId, boolean>>>({});
  const [results, setResults] = useState<JobResult[] | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const save = useImportFactors();

  const clientSites = useMemo(
    () => sites.filter((s) => !clientId || s.company?.company_id === clientId).sort((a, b) => a.name.localeCompare(b.name)),
    [sites, clientId],
  );
  const target: Target | null = targetValue?.startsWith("client:")
    ? { kind: "client", clientId: Number(targetValue.slice(7)) }
    : targetValue
      ? { kind: "site", siteId: Number(targetValue) }
      : null;
  const targetSiteId = target?.kind === "site" ? target.siteId : null;
  // One site: its own categories. All of a client's sites: any category (sites without it are skipped and listed).
  const allowed = useMemo(() => categoriesFor(targetSiteId, sites, categories), [targetSiteId, sites, categories]);
  const categoryOptions = allowed.map((c) => ({ value: c.category_id, label: c.category_name }));
  const dbCategories = allowed.map((c) => ({ id: c.category_id, name: c.category_name }));
  const catName = (id: number) => categories.find((c) => c.category_id === id)?.category_name ?? `Category ${id}`;

  const plan = target ? planUpload(rows, map, target, sites, categories) : null;
  const groups = parse ? groupsOf(parse) : [""];
  const invalid = rows.filter((r) => !r.excluded && rowProblem(r));
  const flow = FLOW[mode];
  const index = flow.indexOf(step);

  const dirty = !!file && !results;
  const close = () => (dirty && !save.isPending ? setConfirmClose(true) : onClose());
  const touch = (s: StepId) => setTouched((t) => ({ ...t, [s]: true }));

  const resetRead = () => {
    setRows([]);
    setParse(null);
    setParseErrors([]);
    setReadError(null);
    read.reset();
    reAnalyze.reset();
  };

  const applyParse = (p: ParseResult, keepMap: boolean) => {
    setParse(p);
    setSheet(p.selected_sheet ?? p.sheet_names[0] ?? null);
    setColumns(detectedColumns(p.schema_detected));
    setRows(rowsFromParse(p));
    setFilter({ group: null, year: null, q: "" });
    const fresh = initialMap(p, allowed.map((c) => c.category_id));
    // Re-analyzing keeps choices already made for groups that still exist.
    setMap(keepMap ? Object.fromEntries(Object.keys(fresh).map((g) => [g, map[g] ?? fresh[g]])) : fresh);
  };

  const readFile = async () => {
    touch("upload");
    if (!file || !target) return;
    setReadError(null);
    if (mode === "ai") {
      read.mutate(
        { file, categories: dbCategories },
        {
          onSuccess: (p) => {
            if (!p.factors.length && !p.available_columns.length) {
              setReadError("The AI found no factors in this workbook.");
              return;
            }
            applyParse(p, false);
            setStep("layout");
          },
          onError: (e) => setReadError(errorMessage(e, "The AI service couldn't read this file. Try again, or use a simple sheet.")),
        },
      );
      return;
    }
    setReadingSimple(true);
    try {
      const json = await readFirstSheet(file);
      const parsed = parseSimpleRows(json);
      if (!json.length) setReadError("The first sheet is empty.");
      else if (!parsed.rows.length) setReadError("No row has both a year and a factor. Check the headers: year, factor_value, unit, source, emission_category_name.");
      setRows(parsed.rows);
      setParseErrors(parsed.errors);
      if (parsed.rows.length) setStep("preview");
    } catch {
      setReadError("This file couldn't be read as an Excel workbook. Save it as .xlsx and try again.");
    } finally {
      setReadingSimple(false);
    }
  };

  const runReAnalyze = (nextSheet?: string) => {
    if (!parse?.upload_id) return;
    const override = nextSheet ? null : schemaOverride(parse.schema_detected, columns, parse.available_columns);
    if (!nextSheet && !override) return;
    reAnalyze.mutate(
      { uploadId: parse.upload_id, sheet: nextSheet ?? sheet ?? undefined, override, categories: dbCategories },
      { onSuccess: (p) => applyParse(p, true) },
    );
  };

  const columnsChanged = !!parse && !!schemaOverride(parse.schema_detected, columns, parse.available_columns);
  const columnsMissing = !!parse && (columns.name === null || (needsValueColumn(parse.schema_detected) && columns.value === null));
  const mappedCount = groups.filter((g) => map[g]).length;
  const mapError = touched.map && mappedCount === 0 ? (groups.length > 1 ? "Map at least one group to a category." : "Choose the category these factors belong to.") : undefined;
  const simpleCategoryError = touched.preview && mode === "simple" && !map[""] ? "Choose the category these factors belong to." : undefined;
  const canSave = !!target && mappedCount > 0 && !!plan && plan.rowCount > 0 && invalid.length === 0;

  const onSave = () => {
    touch("preview");
    if (!canSave || !plan) return;
    save.mutate(
      { plan, categoryName: catName, uploadId: parse?.upload_id ?? null, siteId: targetSiteId },
      {
        onSuccess: (res) => {
          setResults(res);
          setStep("result");
        },
      },
    );
  };

  const back = () => setStep(flow[Math.max(0, index - 1)]);
  let footer: React.ReactNode;
  if (step === "upload") {
    footer = (
      <div className="flex w-full justify-end gap-2">
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => void readFile()} disabled={!file || read.isPending || readingSimple} loading={read.isPending || readingSimple}>
          {mode === "ai" ? "Read with AI" : "Read sheet"}
        </Button>
      </div>
    );
  } else if (step === "layout") {
    footer = (
      <div className="flex w-full flex-wrap justify-end gap-2">
        <Button onClick={back}>Back</Button>
        <Button
          variant="primary"
          onClick={() => setStep("map")}
          disabled={columnsChanged || columnsMissing || reAnalyze.isPending || rows.length === 0}
          title={columnsChanged ? "Re-analyze to apply the column changes first" : undefined}
        >
          Continue
        </Button>
      </div>
    );
  } else if (step === "map") {
    footer = (
      <div className="flex w-full justify-end gap-2">
        <Button onClick={back}>Back</Button>
        <Button
          variant="primary"
          onClick={() => {
            touch("map");
            if (mappedCount > 0) setStep("preview");
          }}
        >
          Continue
        </Button>
      </div>
    );
  } else if (step === "preview") {
    footer = (
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button onClick={back} disabled={save.isPending}>
          Back
        </Button>
        <span className="text-sm text-muted" data-testid="import-count">
          {plan && mappedCount > 0 ? `${plan.rowCount} ${plan.rowCount === 1 ? "factor" : "factors"} to save` : `${rows.filter((r) => !r.excluded).length} of ${rows.length} rows included`}
        </span>
        <Button variant="primary" className="ml-auto" onClick={onSave} loading={save.isPending} disabled={save.isPending || (!!touched.preview && !canSave)}>
          Save factors
        </Button>
      </div>
    );
  } else {
    footer = (
      <div className="flex w-full justify-end">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <>
      <Drawer open size="lg" onClose={close} title="Import factors" subtitle="Upload a sheet, check the rows, then save." footer={footer}>
        <div className="space-y-5">
          <Stepper
            steps={flow.map((id) => ({ id, ...STEP_LABEL[id] }))}
            current={index}
            completed={flow.slice(0, index)}
            label="Import steps"
          />
          {step === "upload" && (
            <UploadStep
              mode={mode}
              onMode={(m) => {
                setMode(m);
                resetRead();
              }}
              file={file}
              onFile={(f) => {
                setFile(f);
                resetRead();
              }}
              companies={companies}
              clientId={clientId}
              onClient={(id) => {
                setClientId(id);
                setTargetValue(null);
              }}
              clientSites={clientSites}
              target={targetValue}
              onTarget={(v) => {
                setTargetValue(v);
                // A site may not report categories already chosen.
                if (v && !v.startsWith("client:")) {
                  const own = new Set((sites.find((s) => s.site_id === Number(v))?.categories ?? []).map((c) => c.category_id));
                  setMap((m) => Object.fromEntries(Object.entries(m).map(([g, id]) => [g, id && own.has(id) ? id : null])));
                }
              }}
              targetError={touched.upload && !target ? "Choose a site, or all of a client's sites." : undefined}
              error={readError}
            />
          )}
          {step === "layout" && parse && (
            <LayoutStep
              parse={parse}
              sheet={sheet}
              onSheet={(s) => {
                setSheet(s);
                runReAnalyze(s);
              }}
              columns={columns}
              onColumns={setColumns}
              busy={reAnalyze.isPending}
              error={reAnalyze.error ? errorMessage(reAnalyze.error, "The AI service didn't answer. Try again.") : null}
              onReAnalyze={() => runReAnalyze()}
            />
          )}
          {step === "map" && parse && <MapStep parse={parse} rows={rows} map={map} onMap={setMap} categories={categoryOptions} error={mapError} />}
          {step === "preview" && (
            <PreviewStep
              rows={rows}
              shown={previewRows(rows, filter)}
              update={(key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))}
              filter={filter}
              onFilter={setFilter}
              groups={groups.filter(Boolean)}
              years={distinctYears(rows)}
              category={mode === "simple" ? { value: map[""] ?? null, onChange: (v) => setMap({ "": v }), options: categoryOptions, error: simpleCategoryError } : undefined}
              parseErrors={parseErrors}
              plan={mappedCount > 0 ? plan : null}
              saveError={save.error ? errorMessage(save.error, "Try again.") : null}
            />
          )}
          {step === "result" && results && <ResultStep results={results} plan={plan} />}
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Stop this import?"
        description="Nothing from this sheet has been saved yet."
        cancelLabel="Keep going"
        primaryAction={{
          label: "Stop import",
          onClick: () => {
            setConfirmClose(false);
            onClose();
          },
        }}
      />
    </>
  );
}
