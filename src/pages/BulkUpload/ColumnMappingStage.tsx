
import { useState } from "react";
import { ColumnMappingEntry } from "../UserDataEntry/types";

interface ColumnMappingStageProps {
  totalRows: number;
  uniqueCategoryCount: number | null;
  uniqueCategories: string[];
  selectedCategories: Set<string>;
  uploadedHeaders: string[];
  columnMappings: ColumnMappingEntry[];
  uploadedRows: Record<string, string>[];
  onUpdateMapping: (requiredField: string, mappedTo: string) => void;
  onToggleSkip: (requiredField: string) => void;
  onToggleCategory: (category: string) => void;
  onToggleAllCategories: (categories: string[]) => void;
  categoryTypeWarning: string | null;
  resolvingMappings?: boolean;
  onBack: () => void;
  onProceed: () => void;
}

export function ColumnMappingStage({
  totalRows,
  uniqueCategoryCount,
  uniqueCategories,
  selectedCategories,
  uploadedHeaders,
  columnMappings,
  uploadedRows,
  onUpdateMapping,
  onToggleSkip,
  onToggleCategory,
  onToggleAllCategories,
  categoryTypeWarning,
  resolvingMappings,
  onBack,
  onProceed,
}: ColumnMappingStageProps) {
  const [categoryListOpen, setCategoryListOpen] = useState(true);

  const requiredMapped = columnMappings
    .filter((m) => m.isRequired)
    .every((m) => m.mappedTo || m.skipped);

  const mappedCount = columnMappings.filter((m) => m.mappedTo && !m.skipped).length;

  const categoryMapped = columnMappings.find(
    (m) => m.requiredField === "emission_category" && m.mappedTo && !m.skipped
  );

  const allSelected = uniqueCategories.length > 0 && selectedCategories.size === uniqueCategories.length;
  const noneSelected = selectedCategories.size === 0;
  const someSelected = !allSelected && !noneSelected;

  // Rows that will be included based on selected categories
  const includedRowCount = selectedCategories.size === 0
    ? totalRows
    : (() => {
        const catMapping = columnMappings.find((m) => m.requiredField === "emission_category");
        if (!catMapping || !catMapping.mappedTo) return totalRows;
        return uploadedRows.filter((r) =>
          selectedCategories.has(r[catMapping.mappedTo]?.trim())
        ).length;
      })();

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Total Rows"
          value={totalRows.toString()}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
          }
          color="blue"
        />
        <SummaryCard
          label="Unique Categories"
          value={uniqueCategoryCount !== null ? uniqueCategoryCount.toString() : "—"}
          subtext={uniqueCategoryCount === null ? "Map category column to see" : undefined}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          }
          color="purple"
        />
        <SummaryCard
          label="Fields Mapped"
          value={`${mappedCount} / ${columnMappings.length}`}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="green"
        />
      </div>

      {/* Category Filter — only show when category column is mapped */}
      {categoryMapped && uniqueCategories.length > 0 && (
        <div className="border border-purple-200 rounded-lg overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setCategoryListOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-50 hover:bg-purple-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="text-sm font-semibold text-purple-700">
                Filter Categories
              </span>
              <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                {selectedCategories.size} / {uniqueCategories.length} selected
              </span>
              {selectedCategories.size > 0 && selectedCategories.size < uniqueCategories.length && (
                <span className="text-xs text-purple-500">
                  → {includedRowCount} rows included
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-purple-400 transition-transform ${categoryListOpen ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Category List */}
          {categoryListOpen && (
            <div className="bg-white">
              {/* Select All row */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => onToggleAllCategories(uniqueCategories)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 cursor-pointer"
                />
                <span className="text-sm font-semibold text-gray-700">
                  Select All
                </span>
                {someSelected && (
                  <span className="text-xs text-gray-400 ml-auto">
                    {selectedCategories.size} of {uniqueCategories.length}
                  </span>
                )}
              </div>

              {/* Individual categories */}
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                {uniqueCategories.map((category) => {
                  const isChecked = selectedCategories.has(category);
                  return (
                    <label
                      key={category}
                      className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors
                        ${isChecked ? "bg-white hover:bg-purple-50" : "bg-gray-50 hover:bg-gray-100"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleCategory(category)}
                        className="w-4 h-4 rounded border-gray-300 text-purple-600 cursor-pointer"
                      />
                      <span className={`text-sm font-mono ${isChecked ? "text-gray-800" : "text-gray-400 line-through"}`}>
                        {category}
                      </span>
                      {!isChecked && (
                        <span className="ml-auto text-xs text-gray-400 italic">excluded</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mapping Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Column Mapping
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {columnMappings.map((mapping) => (
            <div
              key={mapping.requiredField}
              className={`flex items-center gap-4 px-4 py-3 transition-colors
                ${mapping.skipped ? "bg-gray-50 opacity-60" : "bg-white"}`}
            >
              {/* Required Field Label */}
              <div className="w-48 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {mapping.label}
                  </span>
                  {mapping.isRequired && (
                    <span className="text-red-500 text-xs">*</span>
                  )}
                </div>
              
                {mapping.mappedTo && !mapping.skipped && !(mapping.requiredField === "emission_category" && categoryTypeWarning) && (
  <span className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd" />
    </svg>
    Mapped
  </span>
)}

{mapping.requiredField === "emission_category" && mapping.mappedTo && categoryTypeWarning && (
  <span className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
    ⚠️ Invalid column
  </span>
)}
              </div>

              {/* Arrow */}
              <div className="text-gray-300 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>

              {/* Column Selector */}
              <div className="flex-1">
                <select
                  value={mapping.mappedTo}
                  onChange={(e) => onUpdateMapping(mapping.requiredField, e.target.value)}
                  disabled={mapping.skipped}
                  className={`w-full text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${mapping.skipped
                      ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                      : mapping.mappedTo
                        ? "border-green-300 bg-green-50 text-gray-700"
                        : "border-gray-300 bg-white text-gray-500"
                    }`}
                >
                  <option value="">— Select column from your file —</option>
                  {uploadedHeaders.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Preview of first value */}
              {mapping.mappedTo && !mapping.skipped && uploadedRows[0] && (
                <div className="w-32 shrink-0 hidden lg:block">
                  <span className="text-xs text-gray-400 italic truncate block" title={uploadedRows[0][mapping.mappedTo]}>
                    e.g. "{String(uploadedRows[0][mapping.mappedTo] || "").substring(0, 18)}"
                  </span>
                </div>
              )}

              {/* Skip Toggle */}
              {!mapping.isRequired && (
                <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mapping.skipped}
                    onChange={() => onToggleSkip(mapping.requiredField)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-gray-500"
                  />
                  <span className="text-xs text-gray-500">Skip</span>
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Required field note */}
      <p className="text-xs text-gray-400">
        <span className="text-red-500">*</span> Required fields must be mapped to proceed
      </p>
      {categoryTypeWarning && (
  <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
    <span>⚠️</span>
    <span>{categoryTypeWarning}</span>
  </div>
)}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onProceed}
          disabled={!requiredMapped || !!categoryTypeWarning || resolvingMappings}
          className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {resolvingMappings ? "Resolving categories..." : "Preview Import →"}
          {!resolvingMappings && selectedCategories.size > 0 && selectedCategories.size < uniqueCategories.length && (
            <span className="ml-1.5 text-xs opacity-80">({includedRowCount} rows)</span>
          )}
        </button>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  color: "blue" | "purple" | "green";
}

const colorMap = {
  blue: { bg: "bg-blue-50", border: "border-blue-100", icon: "text-blue-500", value: "text-blue-700" },
  purple: { bg: "bg-purple-50", border: "border-purple-100", icon: "text-purple-500", value: "text-purple-700" },
  green: { bg: "bg-green-50", border: "border-green-100", icon: "text-green-500", value: "text-green-700" },
};

function SummaryCard({ label, value, subtext, icon, color }: SummaryCardProps) {
  const c = colorMap[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-3 flex items-start gap-3`}>
      <div className={`${c.icon} mt-0.5 shrink-0`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-lg font-bold ${c.value}`}>{value}</p>
        {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}