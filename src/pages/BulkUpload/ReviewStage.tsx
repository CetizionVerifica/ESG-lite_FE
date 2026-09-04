import { ColumnMappingEntry } from "../UserDataEntry/types";

interface ReviewStageProps {
  reviewRows: Record<string, any>[]; 
  columnMappings: ColumnMappingEntry[];
  importing: boolean;
  importProgress: { current: number; total: number };
  importError: string | null;

  uniqueCategories: string[];
  selectedCategories: Set<string>;
  onToggleCategory: (cat: string) => void;
  onToggleAllCategories: (cats: string[]) => void;

  totalRows: number;

  onBack: () => void;
  onImport: () => void;
}

function fmtNumber(v: any, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function ReviewStage({
  reviewRows,
  columnMappings,
  importing,
  importProgress,
  importError,
  uniqueCategories,
  selectedCategories,
  onToggleCategory,
  onToggleAllCategories,
  totalRows,
  onBack,
  onImport,
}: ReviewStageProps) {
  const mappedFields = columnMappings.filter((m) => m.mappedTo && !m.skipped);

  const allSelected = uniqueCategories.length > 0 && selectedCategories.size === uniqueCategories.length;
  const noneSelected = selectedCategories.size === 0;
  const someSelected = !allSelected && !noneSelected;

  // detect if backend has added these preview fields
  const hasGlobalCat = reviewRows.some((r) => r?.global_category_name !== undefined && r?.global_category_name !== null);
  const hasFactor = reviewRows.some((r) => r?.factor_value !== undefined && r?.factor_value !== null);
  const hasDenom = reviewRows.some((r) => r?.denominator_unit !== undefined && r?.denominator_unit !== null);
  const hasEmission = reviewRows.some((r) => r?.total_emission !== undefined && r?.total_emission !== null);

  // Multi-field calculation categories return a per-row reason when the row
  // can't be computed. The import SKIPS those rows, so they have to be visible
  // here — otherwise the only signal is a lower "imported N rows" at the end.
  const errorRowCount = reviewRows.filter((r) => r?.row_error).length;
  const hasRowErrors = errorRowCount > 0;

  // build final columns: mapped fields + computed fields
  const computedCols = [
    hasGlobalCat ? { key: "global_category_name", label: "Global Category" } : null,
    hasFactor ? { key: "factor_value", label: "Emission Factor" } : null,
    hasDenom ? { key: "denominator_unit", label: "Denominator Unit" } : null,
    hasEmission ? { key: "total_emission", label: "Total Emission (tCO2e)" } : null,
    hasRowErrors ? { key: "row_error", label: "Issue" } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const colSpan = mappedFields.length + computedCols.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Top info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Preview:</span>{" "}
            showing first <span className="font-semibold">100</span> rows only.
          </div>
          <div className="text-sm text-gray-600">
            Total rows in file: <span className="font-semibold">{totalRows}</span>
          </div>
        </div>

        {hasRowErrors && (
          <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
            <span className="font-semibold">
              {errorRowCount} of the {reviewRows.length} previewed row
              {errorRowCount === 1 ? "" : "s"} cannot be calculated
            </span>{" "}
            and will be skipped on import — see the Issue column. Fix them in the
            spreadsheet and re-upload if they should be included.
          </div>
        )}

        {/* Small hint if computed values are missing */}
        {!hasEmission && (
          <div className="mt-2 text-xs text-amber-700">
            Note: emission factor / total emission will appear here once the preview API returns them.
          </div>
        )}
      </div>

      {/* Category filter */}
      {uniqueCategories.length > 0 && (
        <div className="border border-purple-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-purple-50">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => onToggleAllCategories(uniqueCategories)}
              className="w-4 h-4 rounded border-gray-300 text-purple-600 cursor-pointer"
              disabled={importing}
            />
            <span className="text-sm font-semibold text-purple-800">Filter Categories</span>
            <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-medium">
              {selectedCategories.size} / {uniqueCategories.length} selected
            </span>
            {noneSelected && (
              <span className="text-xs text-red-600 ml-auto">
                No category selected → import will include all
              </span>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 bg-white">
            {uniqueCategories.map((cat) => {
              const isChecked = selectedCategories.has(cat);
              return (
                <label
                  key={cat}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors
                    ${isChecked ? "hover:bg-purple-50" : "bg-gray-50 hover:bg-gray-100"}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleCategory(cat)}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 cursor-pointer"
                    disabled={importing}
                  />
                  <span className={`text-sm font-mono ${isChecked ? "text-gray-800" : "text-gray-400 line-through"}`}>
                    {cat}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100 border-b border-gray-200">
                {mappedFields.map((m) => (
                  <th
                    key={m.requiredField}
                    className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap"
                  >
                    {m.label}
                  </th>
                ))}

                {computedCols.map((c) => (
                  <th
                    key={c.key}
                    className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {reviewRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={row?.row_error ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50"}
                >
                  {mappedFields.map((m) => (
                    <td key={m.requiredField} className="px-3 py-2 text-gray-700 max-w-40 truncate">
                      {row?.[m.requiredField] ? String(row[m.requiredField]) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}

                  {computedCols.map((c) => {
                    const v = row?.[c.key];

                    // formatting rules
                    if (c.key === "factor_value") {
                      return (
                        <td key={c.key} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {v === null || v === undefined ? <span className="text-gray-300">—</span> : fmtNumber(v, 6)}
                        </td>
                      );
                    }
                    if (c.key === "row_error") {
                      return (
                        <td key={c.key} className="px-3 py-2 text-amber-800 max-w-64">
                          {v ? String(v) : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    }
                    if (c.key === "total_emission") {
                      return (
                        <td key={c.key} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {v === null || v === undefined ? <span className="text-gray-300">—</span> : fmtNumber(v, 2)}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {v ? String(v) : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {!reviewRows.length && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-400" colSpan={colSpan}>
                    No preview rows returned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Progress */}
      {importing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-blue-700">Importing...</span>
            <span className="text-sm text-blue-600">
              {importProgress.current} / {importProgress.total}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{
                width:
                  importProgress.total > 0
                    ? `${(importProgress.current / importProgress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* Import Error */}
      {importError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{importError}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-1">
        <button
          onClick={onBack}
          disabled={importing}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          ← Back to Mapping
        </button>
        <button
          onClick={onImport}
          disabled={importing}
          className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? "Importing..." : "Import All"}
        </button>
      </div>
    </div>
  );
}