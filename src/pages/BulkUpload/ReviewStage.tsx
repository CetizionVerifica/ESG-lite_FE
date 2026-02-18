import { BulkReviewRow, ColumnMappingEntry } from "../UserDataEntry/types";

interface ReviewStageProps {
  reviewRows: BulkReviewRow[];
  columnMappings: ColumnMappingEntry[];
  selectedRowIds: Set<number>;
  validRows: BulkReviewRow[];
  errorRows: BulkReviewRow[];
  importing: boolean;
  importProgress: { current: number; total: number };
  importError: string | null;
  onToggleRow: (id: number) => void;
  onSelectAllValid: () => void;
  onDeselectAll: () => void;
  onBack: () => void;
  onImport: () => void;
}

export function ReviewStage({
  reviewRows,
  columnMappings,
  selectedRowIds,
  validRows,
  errorRows,
  importing,
  importProgress,
  importError,
  onToggleRow,
  onSelectAllValid,
  onDeselectAll,
  onBack,
  onImport,
}: ReviewStageProps) {
  const selectedCount = selectedRowIds.size;
  const mappedFields = columnMappings.filter((m) => m.mappedTo && !m.skipped);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-700">{reviewRows.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-xs text-green-600">Valid</p>
          <p className="text-2xl font-bold text-green-700">{validRows.length}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-xs text-red-500">Errors</p>
          <p className="text-2xl font-bold text-red-700">{errorRows.length}</p>
        </div>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">{selectedCount}</span> row{selectedCount !== 1 ? "s" : ""} selected for import
        </p>
        <div className="flex gap-2">
          <button
            onClick={onSelectAllValid}
            className="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
          >
            Select all valid
          </button>
          <button
            onClick={onDeselectAll}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50 transition-colors"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Preview Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-2 text-left w-10">
                  <span className="sr-only">Select</span>
                </th>
                {mappedFields.map((m) => (
                  <th key={m.requiredField} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                  tCO2e
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviewRows.map((row) => {
                const isSelected = selectedRowIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => row.isValid && onToggleRow(row.id)}
                    className={`transition-colors
                      ${!row.isValid ? "bg-red-50 cursor-not-allowed" : "cursor-pointer"}
                      ${isSelected && row.isValid ? "bg-blue-50" : ""}
                      ${row.isValid && !isSelected ? "hover:bg-gray-50" : ""}
                    `}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!row.isValid}
                        onChange={() => onToggleRow(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Mapped Data Cells */}
                    {mappedFields.map((m) => (
                      <td key={m.requiredField} className="px-3 py-2 text-gray-700 max-w-40 truncate">
                        {m.requiredField === "emission_category"
                          ? row.emission_category || <span className="text-red-400 italic">missing</span>
                          : row.mappedData[m.requiredField] || <span className="text-gray-300">—</span>
                        }
                      </td>
                    ))}

                    {/* Emission Value */}
                    <td className="px-3 py-2 text-right font-mono">
                      {row.total_emission !== null
                        ? <span className="text-gray-800">{row.total_emission.toFixed(4)}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      {row.isValid ? (
                        <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded-full text-xs font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd" />
                          </svg>
                          Valid
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-red-700 bg-red-100 px-2 py-0.5 rounded-full text-xs font-medium cursor-help"
                          title={row.errorReason || "Error"}
                        >
                          <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd" />
                          </svg>
                          {row.errorReason
                            ? row.errorReason.length > 22
                              ? row.errorReason.substring(0, 22) + "…"
                              : row.errorReason
                            : "Error"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Import Error */}
      {importError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700">{importError}</p>
        </div>
      )}

      {/* Error rows skipped notice */}
      {errorRows.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700">
            {errorRows.length} row{errorRows.length > 1 ? "s" : ""} with errors will be skipped. Hover the error badge for details.
          </p>
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
          disabled={selectedCount === 0 || importing}
          className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {importing
            ? `Saving ${importProgress.current} of ${importProgress.total}...`
            : `Import ${selectedCount} row${selectedCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}