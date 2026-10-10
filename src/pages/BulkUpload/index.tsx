import { useState } from "react";
import Modal from "../../components/Modal";
import { FileUploadStage } from "./FileUploadStage";
import { ColumnMappingStage } from "./ColumnMappingStage";
import { ReviewStage } from "./ReviewStage";
import { useBulkUpload } from "./UseBulkUpload";
import { BulkUploadModalProps } from "../UserDataEntry/types";

const STAGES = [
  { key: "upload", label: "Upload File" },
  { key: "mapping", label: "Map Columns" },
  { key: "review", label: "Review & Import" },
] as const;

export function BulkUploadModal(props: BulkUploadModalProps) {
  const { isOpen, onClose } = props;

  const {
    stage,
    uploadedHeaders,
    uploadedRows, // preview rows (first 100)
    columnMappings,

    uniqueCategories,
    selectedCategories,
    toggleCategory,
    toggleAllCategories,

    importing,
    importProgress,
    importError,
    parseError,


    totalRows,

    // loading flags for slow backend
    uploading,
    loadingCategories,
    loadingPreview,

    parseFile,
    updateMapping,
    toggleSkip,
    proceedToReview,
    loadUniqueCategories,
    handleImport,
    handleReset,
    setStage,
  } = useBulkUpload(props);

  // ✅ NEW: success message (shown inside modal)
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleClose = () => {
    // block close while requests are running
    if (importing || uploading || loadingCategories || loadingPreview) return;
    handleReset();
    setSuccessMsg(null);
    onClose();
  };

  const currentStageIndex = STAGES.findIndex((s) => s.key === stage);

  // ✅ mapping stage: first load categories, then preview
  const handleProceedFromMapping = async () => {
    if (loadingCategories || loadingPreview) return;

    // If categories not loaded yet, fetch them first and stay on mapping screen
    if (!uniqueCategories.length) {
      await loadUniqueCategories();
      return;
    }

    // Categories already loaded & user selected => now preview
    await proceedToReview();
  };

  // ✅ NEW: import wrapper (shows success + refresh parent)
  const handleImportAndFinish = async () => {
    setSuccessMsg(null);

    try {
      // IMPORTANT: handleImport() should throw on error.
      // Optional: if your handleImport returns backend response, you can use it here.
      const res: any = await handleImport();

      const inserted = res?.inserted ?? res?.data?.inserted ?? null;
      // Rows the engine could not calculate are dropped rather than saved with a
      // wrong total, so the count has to be reported — a bare "imported N rows"
      // reads as success even when a third of the sheet never made it in.
      const skipped = res?.skipped ?? res?.data?.skipped ?? 0;
      // Newer AI service: FERA twins are counted apart from `inserted`.
      const fera = res?.fera_inserted ?? res?.data?.fera_inserted ?? 0;
      const feraNote = fera > 0 ? ` Plus ${fera} FERA row${fera === 1 ? "" : "s"}.` : "";

      setSuccessMsg(
        inserted !== null
          ? skipped > 0
            ? `Imported ${inserted} rows.${feraNote} ${skipped} row${skipped === 1 ? "" : "s"} skipped — they could not be calculated (check the Issue column in the preview).`
            : `Saved successfully. Imported ${inserted} rows.${feraNote}`
          : "Saved successfully."
      );

      // ✅ refresh parent table (UserDataEntryPage)
      // If your parent expects an array of new emissions, pass it.
      // If your parent simply refetches from DB, just call it without args.
      await props.onImportComplete?.(res);

      // ✅ close after short pause (so user sees message); a skipped-row notice
      // needs longer than the plain success case to actually be read
      setTimeout(() => {
        handleReset();
        setSuccessMsg(null);
        onClose();
      }, skipped > 0 ? 4000 : 900);
    } catch {
      // importError is already handled inside hook; keep modal open
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Upload"
      className="max-w-3xl! max-h-[90vh]!"
    >
      <div className="flex flex-col gap-5">
        {/* Stage Stepper */}
        <div className="flex items-center gap-0">
          {STAGES.map((s, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            const isLast = idx === STAGES.length - 1;

            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                      ${
                        isCompleted
                          ? "bg-blue-600 border-blue-600 text-white"
                          : isCurrent
                          ? "bg-white border-blue-600 text-blue-600"
                          : "bg-white border-gray-300 text-gray-400"
                      }`}
                  >
                    {isCompleted ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap font-medium
                      ${
                        isCurrent
                          ? "text-blue-600"
                          : isCompleted
                          ? "text-blue-500"
                          : "text-gray-400"
                      }`}
                  >
                    {s.label}
                  </span>
                </div>

                {!isLast && (
                  <div
                    className={`flex-1 h-0.5 mx-2 mb-4 transition-all
                      ${isCompleted ? "bg-blue-500" : "bg-gray-200"}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-100" />

        {/* ✅ Success banner (correct place) */}
        {successMsg && (
          <div className="mb-2 flex items-start justify-between gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">{successMsg}</p>
            <button
              className="text-green-700 hover:text-green-900 text-sm"
              onClick={() => setSuccessMsg(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Stage Content */}
        <div className="min-h-75">
          {stage === "upload" && (
            <FileUploadStage
              onFileParsed={parseFile}
              parseError={parseError}
              // NOTE: your FileUploadStage currently doesn't accept "processing" prop in the pasted code.
              // If you added it, keep this line. If not, remove it.
              processing={uploading as any}
            />
          )}

          {stage === "mapping" && (
            <ColumnMappingStage
              totalRows={totalRows}
              uniqueCategoryCount={uniqueCategories.length || null}
              uniqueCategories={uniqueCategories}
              selectedCategories={selectedCategories}
              uploadedHeaders={uploadedHeaders}
              columnMappings={columnMappings}
              uploadedRows={uploadedRows}
              onUpdateMapping={updateMapping}
              onToggleSkip={toggleSkip}
              onToggleCategory={toggleCategory}
              onToggleAllCategories={toggleAllCategories}
              onBack={handleReset}
              categoryTypeWarning={null}
              onProceed={handleProceedFromMapping}
              loadingCategories={loadingCategories}
              loadingPreview={loadingPreview}
            />
          )}

          {stage === "review" && (
            <ReviewStage
              reviewRows={uploadedRows}
              columnMappings={columnMappings}
              importing={importing}
              importProgress={importProgress}
              importError={importError}
              uniqueCategories={uniqueCategories}
              selectedCategories={selectedCategories}
              onToggleCategory={toggleCategory}
              onToggleAllCategories={toggleAllCategories}
              totalRows={totalRows}
              onBack={() => setStage("mapping")}
              // ✅ IMPORTANT: use wrapper, NOT handleImport
              onImport={handleImportAndFinish}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

export default BulkUploadModal;