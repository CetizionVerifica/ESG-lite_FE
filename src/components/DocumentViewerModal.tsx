import { useState, useEffect } from "react";
import { EmissionDocument, formatFileSize } from "../services/documentService";

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: EmissionDocument | null;
  documents?: EmissionDocument[];
  onNavigate?: (doc: EmissionDocument) => void;
}

const DocumentViewerModal = ({
  isOpen,
  onClose,
  document,
  documents = [],
  onNavigate,
}: DocumentViewerModalProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived values - compute safely even when document is null
  const fileUrl = document?.secure_url || document?.cloudinary_url || "";
  const isImage = document?.file_type?.startsWith("image/") || false;
  const isPdf = document?.file_type === "application/pdf";
  const isVideo = document?.file_type?.startsWith("video/") || false;
  const isAudio = document?.file_type?.startsWith("audio/") || false;

  // Office document types that can be viewed via Microsoft Office Online
  const officeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    "application/vnd.ms-powerpoint", // .ppt
  ];
  const isOfficeDoc = document?.file_type ? officeTypes.includes(document.file_type) : false;

  const isPreviewable = isImage || isPdf || isVideo || isAudio || isOfficeDoc;

  // Find current index for navigation
  const currentIndex = document
    ? documents.findIndex((d) => d.document_id === document.document_id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < documents.length - 1;

  useEffect(() => {
    if (isOpen && document) {
      setLoading(true);
      setError(null);
    }
  }, [isOpen, document]);

  // For non-previewable files, set loading to false immediately
  useEffect(() => {
    if (isOpen && document && !isPreviewable) {
      setLoading(false);
    }
  }, [isOpen, document, isPreviewable]);

  useEffect(() => {
    if (!isOpen || !document) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev && onNavigate) {
        onNavigate(documents[currentIndex - 1]);
      }
      if (e.key === "ArrowRight" && hasNext && onNavigate) {
        onNavigate(documents[currentIndex + 1]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, document, currentIndex, documents, hasPrev, hasNext, onNavigate, onClose]);

  if (!isOpen || !document) return null;

  const handlePrev = () => {
    if (hasPrev && onNavigate) {
      onNavigate(documents[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && onNavigate) {
      onNavigate(documents[currentIndex + 1]);
    }
  };

  const renderPreview = () => {
    if (isImage) {
      return (
        <div className="flex items-center justify-center h-full">
          <img
            src={fileUrl}
            alt={document.original_name}
            className="max-w-full max-h-full object-contain"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError("Failed to load image");
            }}
          />
        </div>
      );
    }

    if (isPdf) {
      return (
        <iframe
          src={`${fileUrl}#toolbar=1&navpanes=0`}
          className="w-full h-full border-0"
          title={document.original_name}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError("Failed to load PDF");
          }}
        />
      );
    }

    if (isOfficeDoc) {
      // Use Microsoft Office Online viewer
      const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
      return (
        <iframe
          src={officeViewerUrl}
          className="w-full h-full border-0 bg-white"
          title={document.original_name}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError("Failed to load document");
          }}
        />
      );
    }

    if (isVideo) {
      return (
        <div className="flex items-center justify-center h-full">
          <video
            src={fileUrl}
            controls
            className="max-w-full max-h-full"
            onLoadedData={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError("Failed to load video");
            }}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (isAudio) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <audio
            src={fileUrl}
            controls
            className="w-full max-w-md"
            onLoadedData={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError("Failed to load audio");
            }}
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    // Non-previewable file - loading is handled by useEffect
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="w-32 h-32 bg-gray-100 rounded-2xl flex items-center justify-center">
          <svg
            className="w-16 h-16 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">
            Preview not available
          </p>
          <p className="text-sm text-gray-500 mt-1">
            This file type cannot be previewed in the browser
          </p>
        </div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={document.original_name}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Download File
        </a>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full h-full max-w-6xl max-h-[95vh] m-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-white/95 backdrop-blur rounded-t-lg px-4 py-3 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0">
              {isImage && (
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              {isPdf && (
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              {isVideo && (
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              {isOfficeDoc && (
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              )}
              {!isImage && !isPdf && !isVideo && !isOfficeDoc && (
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-gray-900 truncate">
                {document.original_name}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="capitalize">{document.document_type}</span>
                <span>-</span>
                <span>{formatFileSize(document.file_size)}</span>
                {documents.length > 1 && (
                  <>
                    <span>-</span>
                    <span>
                      {currentIndex + 1} of {documents.length}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download button */}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={document.original_name}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Download"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </a>

            {/* Open in new tab */}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Open in new tab"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-900 rounded-b-lg overflow-hidden relative">
          {/* Loading indicator */}
          {loading && isPreviewable && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400">Loading preview...</span>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-red-400">{error}</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Try opening directly
                </a>
              </div>
            </div>
          )}

          {/* Preview content */}
          <div className="w-full h-full p-4">{renderPreview()}</div>

          {/* Navigation arrows */}
          {documents.length > 1 && (
            <>
              {hasPrev && (
                <button
                  onClick={handlePrev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                  title="Previous (Left Arrow)"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
              )}
              {hasNext && (
                <button
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                  title="Next (Right Arrow)"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer with description */}
        {document.description && (
          <div className="bg-white/95 backdrop-blur rounded-b-lg px-4 py-2 border-t -mt-2 pt-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Description:</span>{" "}
              {document.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewerModal;
