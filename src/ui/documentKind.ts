export type ViewerFile = {
  name: string;
  url: string;
  /** MIME type. */
  type: string;
  size?: number;
  /** Small line under the name, e.g. "Uploaded by Fatima · 14 Sep 2025". */
  meta?: string;
};

export type DocumentKind = "image" | "pdf" | "video" | "audio" | "office" | "other";

const OFFICE = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]);

/** Same preview rules as the legacy DocumentViewerModal. */
export function documentKind(type: string): DocumentKind {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (OFFICE.has(type)) return "office";
  return "other";
}

/** Office files preview through Microsoft's viewer, which needs a public URL (blob: URLs can't). */
export function officeViewerUrl(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

/** Adapter for services/documentService EmissionDocument. */
export function fromEmissionDocument(doc: {
  original_name: string;
  secure_url?: string;
  cloudinary_url?: string;
  file_type: string;
  file_size?: number;
  uploaded_by?: { name?: string } | null;
}): ViewerFile {
  return {
    name: doc.original_name,
    url: doc.secure_url || doc.cloudinary_url || "",
    type: doc.file_type,
    size: doc.file_size,
    meta: doc.uploaded_by?.name ? `Uploaded by ${doc.uploaded_by.name}` : undefined,
  };
}
