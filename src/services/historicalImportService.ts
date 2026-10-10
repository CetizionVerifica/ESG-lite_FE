import api from "../api/axios";

/** One row of the historical sheet as the backend plans it (ESG-lite #83). */
export interface HistoricalPlanRow {
  /** 1 = the first row under the header. */
  row: number;
  /** "2019-01", or null when the year or month isn't recognised. */
  period: string | null;
  fuelType: string;
  activity: string;
  unit: string;
  total: number | null;
  totalFrom: "calculated" | "file" | null;
  status: "import" | "skip";
  reason: string | null;
}

export interface HistoricalSummary {
  totalRows: number;
  toImport: number;
  toSkip: number;
  newPeople: number;
  existingPeople: number;
  site: { id: number; name: string };
  category: { id: number; name: string };
}

export interface HistoricalPreview {
  dryRun: true;
  summary: HistoricalSummary;
  /** The first 100 rows. */
  rows: HistoricalPlanRow[];
  people: { email: string; name: string; exists: boolean }[];
  invalidEmails: string[];
}

export interface HistoricalResult {
  dryRun: false;
  summary: HistoricalSummary & {
    emissionsCreated: number;
    emissionsSkipped: number;
    usersCreated: number;
    createdUsers: string[];
    invitesSent: number;
    inviteWarning: string | null;
  };
  skippedRows: { row: number; period: string | null; reason: string | null }[];
}

export interface HistoricalArgs {
  file: File;
  companyId: number;
  siteId: number;
  categoryId: number;
}

const form = (a: HistoricalArgs, commit: boolean) => {
  const f = new FormData();
  f.append("file", a.file);
  f.append("companyId", String(a.companyId));
  f.append("siteId", String(a.siteId));
  f.append("categoryId", String(a.categoryId));
  // The backend only previews unless commit=true.
  if (commit) f.append("commit", "true");
  return f;
};

/** What the import would do, without saving anything. */
export const previewHistoricalImport = async (a: HistoricalArgs): Promise<HistoricalPreview> =>
  (await api.post("/admin/upload/emissions", form(a, false), { headers: { "Content-Type": "multipart/form-data" } })).data;

/** Saves the rows as Pending and invites the new people. */
export const runHistoricalImport = async (a: HistoricalArgs): Promise<HistoricalResult> =>
  (await api.post("/admin/upload/emissions", form(a, true), { headers: { "Content-Type": "multipart/form-data" } })).data;
