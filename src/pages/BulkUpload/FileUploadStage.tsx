import { useRef, useState, useCallback } from "react";

interface FileUploadStageProps {
  onFileParsed: (file: File) => void;
  parseError: string | null;
}

export function FileUploadStage({ onFileParsed, parseError }: FileUploadStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "csv", "xls"].includes(ext || "")) return;
      onFileParsed(file);
    },
    [onFileParsed]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all
          ${dragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
          }`}
      >
        {/* Icon */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
          ${dragging ? "bg-blue-100" : "bg-gray-100"}`}>
          <svg className={`w-8 h-8 ${dragging ? "text-blue-500" : "text-gray-400"}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">
            {dragging ? "Drop your file here" : "Drag & drop your file here"}
          </p>
          <p className="text-xs text-gray-400 mt-1">or click to browse</p>
        </div>

        <p className="text-xs text-gray-400">Supports .xlsx, .xls, .csv</p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Error */}
      {parseError && (
        <div className="mt-4 w-full max-w-lg flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700">{parseError}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 w-full max-w-lg bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-amber-800 mb-2">Tips for a smooth import</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>First row must be column headers</li>
          <li>Column names matching required fields will be auto-mapped</li>
          <li>You can map any column manually in the next step</li>
        </ul>
      </div>
    </div>
  );
}