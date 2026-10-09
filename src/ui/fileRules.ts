export type FileRules = {
  /** MIME types or extensions: ["application/pdf", "image/*", ".xlsx"]. */
  accept?: string[];
  /** Bytes. */
  maxSize?: number;
  multiple?: boolean;
  /** Max files in total, counting ones already added. */
  maxFiles?: number;
};

export type Rejected = { file: File; reason: string };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function accepted(file: File, accept: string[]): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (r.startsWith(".")) return name.endsWith(r);
    if (r.endsWith("/*")) return type.startsWith(r.slice(0, -1));
    return type === r;
  });
}

/** Splits dropped files into accepted and rejected (with a reason a person can act on). */
export function checkFiles(files: File[], rules: FileRules, existingCount = 0): { ok: File[]; rejected: Rejected[] } {
  const ok: File[] = [];
  const rejected: Rejected[] = [];
  const limit = rules.multiple === false ? 1 : rules.maxFiles ?? Infinity;
  for (const file of files) {
    if (rules.accept?.length && !accepted(file, rules.accept)) rejected.push({ file, reason: "This file type isn't allowed." });
    else if (rules.maxSize && file.size > rules.maxSize) rejected.push({ file, reason: `Larger than ${formatBytes(rules.maxSize)}.` });
    else if (existingCount + ok.length >= limit) rejected.push({ file, reason: limit === 1 ? "Only one file allowed." : `At most ${limit} files.` });
    else ok.push(file);
  }
  return { ok, rejected };
}

export function isPreviewable(type: string): "image" | "pdf" | null {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  return null;
}
