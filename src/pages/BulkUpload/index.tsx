

import Modal from "../../components/Modal";
import { FileUploadStage } from "./FileUploadStage";
import { ColumnMappingStage } from "./ColumnMappingStage";
import { ReviewStage } from "./ReviewStage";
import { useBulkUpload } from "./UseBulkUpload";
import { BulkUploadModalProps } from "../UserDataEntry/types";

const STAGES = [
  { key: "upload",  label: "Upload File" },
  { key: "mapping", label: "Map Columns" },
  { key: "review",  label: "Review & Import" },
] as const;

export function BulkUploadModal(props: BulkUploadModalProps) {
  const { isOpen, onClose } = props;

  const {
    stage,
    uploadedHeaders,
    uploadedRows,
    columnMappings,
    reviewRows,
    selectedRowIds,
    selectedCategories,
    uniqueCategories,
    categoryTypeWarning,
    importing,
    importProgress,
    importError,
    parseError,
    totalRows,
    uniqueCategoryCount,
    validRows,
    errorRows,
    parseFile,
    updateMapping,
    toggleSkip,
    proceedToReview,
    toggleRow,
    selectAllValid,
    deselectAll,
    handleImport,
    handleReset,
    setStage,
    toggleCategory,
    toggleAllCategories,
  } = useBulkUpload(props);

  const handleClose = () => {
    if (importing) return;
    handleReset();
    onClose();
  };

  const currentStageIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Upload"
      className="max-w-3xl! max-h-[90vh]!"
    >
      <div className="flex flex-col gap-5">
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
                      ${isCompleted
                        ? "bg-blue-600 border-blue-600 text-white"
                        : isCurrent
                          ? "bg-white border-blue-600 text-blue-600"
                          : "bg-white border-gray-300 text-gray-400"
                      }`}
                  >
                    {isCompleted ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap font-medium
                      ${isCurrent ? "text-blue-600" : isCompleted ? "text-blue-500" : "text-gray-400"}`}
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
      
        <div className="min-h-75">
          {stage === "upload" && (
            <FileUploadStage
              onFileParsed={parseFile}
              parseError={parseError}
            />
          )}


          {stage === "mapping" && (
            <ColumnMappingStage
              totalRows={totalRows}
              uniqueCategoryCount={uniqueCategoryCount}
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
              categoryTypeWarning={categoryTypeWarning}
              onProceed={proceedToReview}
            />
          )}

          {stage === "review" && (
            <ReviewStage
              reviewRows={reviewRows}
              columnMappings={columnMappings}
              selectedRowIds={selectedRowIds}
              validRows={validRows}
              errorRows={errorRows}
              importing={importing}
              importProgress={importProgress}
              importError={importError}
              onToggleRow={toggleRow}
              onSelectAllValid={selectAllValid}
              onDeselectAll={deselectAll}
              onBack={() => setStage("mapping")}
              onImport={handleImport}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

export default BulkUploadModal;