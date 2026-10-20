/**
 * Mock handlers for every Design Studio endpoint of
 * docs/design-studio/01-contracts.md §4 (DS-0), so each lane builds and tests
 * its screens before its backend lands. Fixture docs: one GHG doc (id 1) and
 * one sustainability doc (id 2) from `src/test/fixtures/studio/` (the same
 * files ESG-lite's schema test accepts). Stateful like the backend: a test
 * can create, save, duplicate, resize, version, share, comment and approve,
 * and read the result back. `resetStudioMocks()` restores the sample.
 *
 * Use in a test:
 *   const server = setupServer(...studioHandlers);   // from "msw/node", or `handlers` from ./index
 *   beforeEach(() => resetStudioMocks());
 *
 * `setStudioMockEnabled(false)` turns the company's switch off: every route
 * but `/studio/status` then answers 403 `DS_STUDIO_OFF`.
 * `setStudioMockKpi(false)` turns KPI tracking off: the sustainability kind
 * answers 403 `DS_KIND_OFF` (doc 2, `kind=sustainability` lists and bodies).
 * Roles aren't modelled: the caller is a Manager, and every call is allowed.
 * Values from `/resolve` are made-up display strings, not reported figures.
 * Shapes marked "mock shape" in `src/lib/studio/contracts.ts` are the owning
 * module's to confirm. Each module keeps its handlers in step.
 */
import { http, HttpResponse } from "msw";
import ghgFixture from "../fixtures/studio/ghg-doc.json";
import { resizeDocument } from "../../lib/studio/resize"; // DS-10
import sustainabilityFixture from "../fixtures/studio/sustainability-doc.json";
import {
  type AiAction,
  type AiUsage,
  type Binding,
  type DataCatalogResponse, // DS-2
  type DataGroup,
  type DataItem,
  type GhgBinding,
  type InputPrefill,
  type InputsPatch,
  type InputsPrefillResponse,
  type KpiBinding,
  type MaterialityResponse,
  type MaterialTopic,
  type YearType,
  inputKeysFor,
  type BrandKit,
  type BrandKitUpdate,
  FONT_IDS,
  type PaletteContrast,
  type ChatReply,
  type Check,
  type ChecksResponse,
  type DocInputsResponse,
  type DriftResponse,
  type DsErrorBody,
  type DsErrorCode,
  DS_ERROR_STATUS,
  type ElementTemplate,
  type FreeformPage,
  type GhgReadiness,
  type BuildProgress, // DS-5
  type CreateDocBody,
  type StudioDocBuild,
  type JobKind,
  type ReportApproval,
  type ReportComment,
  type ReportDoc,
  type ReportInputs,
  type ReportJob,
  type LinkedSource, // DS-10
  type LinkedSourceResponse, // DS-10
  type ResizeBody, // DS-10
  type ResizeResponse, // DS-10
  PAGE_FORMAT_SIZES, // DS-10
  type CreateJobBody, // DS-11
  type CreateShareBody, // DS-11
  type PublicShareMeta, // DS-11
  SHARE_DAYS_DEFAULT, // DS-11
  SHARE_DAYS_MAX, // DS-11
  type ReportKind,
  type ReportLayout,
  type ReportShare,
  type ReportStatus,
  type ReportTemplate,
  type ReportTemplateDetail,
  type ReportVersion,
  type ResolveResponse,
  type ResolvedBinding,
  type StudioAsset,
  type StudioDocResponse,
  type StudioDocSummary,
  type StudioStatus,
  type StylePreset,
  type Suggestion,
  type SustainabilityReadiness,
} from "../../lib/studio/contracts";

export const STUDIO_GHG_DOC = ghgFixture as unknown as ReportDoc;
export const STUDIO_SUSTAINABILITY_DOC = sustainabilityFixture as unknown as ReportDoc;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const NOW = "2026-10-20T09:00:00.000Z";

interface DocRow {
  id: number;
  doc: ReportDoc;
  rev: number;
  status: ReportStatus;
  inputs: ReportInputs;
  updatedAt: string;
  sourceDocId: number | null;
  deleted: boolean;
  versions: ReportVersion[];
  templateId: number | null; // DS-5
  build: BuildProgress | null; // DS-5
  /** GET ?build=1 polls left before a background build reports done (DS-5). */
  buildPolls: number;
}

// DS-4: the shapes GET /studio/templates answers (ESG-lite src/studio/library/service.ts), a few of the seeded rows.
const TEMPLATES: ReportTemplate[] = [
  { id: 1, companyId: null, kind: "ghg", purpose: "report", format: "a4", name: "GHG Inventory · Classic", tags: ["ghg protocol", "inventory", "a4", "classic"], version: 1, thumbnailUrl: null, pageCount: 23, slug: "ghg-inventory-classic", family: "ghg-inventory", look: "classic", description: "A full GHG Protocol inventory." },
  { id: 2, companyId: null, kind: "ghg", purpose: "report", format: "a4", name: "ISO 14064-1 inventory · Night", tags: ["iso 14064-1", "inventory", "night"], version: 1, thumbnailUrl: null, pageCount: 25, slug: "ghg-iso14064-night", family: "ghg-iso14064", look: "night", description: "The Inventory plus ISO 14064-1 categories." },
  { id: 3, companyId: null, kind: "ghg", purpose: "deck", format: "slide_16_9", name: "Board brief · Light", tags: ["deck", "board", "light"], version: 1, thumbnailUrl: null, pageCount: 10, slug: "ghg-board-brief-light", family: "ghg-board-brief", look: "light", description: "Ten slides for the board." },
  { id: 4, companyId: null, kind: "ghg", purpose: "summary", format: "a4", name: "One-page summary · Classic", tags: ["summary", "one page", "factsheet", "classic"], version: 1, thumbnailUrl: null, pageCount: 1, slug: "ghg-one-page-classic", family: "ghg-one-page", look: "classic", description: "The year on one A4 page." },
  { id: 5, companyId: null, kind: "sustainability", purpose: "report", format: "a4", name: "Editorial", tags: ["editorial", "annual report", "gri", "brsr"], version: 1, thumbnailUrl: null, pageCount: 24, slug: "sustainability-editorial", family: "sustainability-editorial", look: "classic", description: "Magazine-style annual report." },
];
const templateDoc = (t: ReportTemplate): ReportDoc => {
  const base = clone(t.kind === "ghg" ? STUDIO_GHG_DOC : STUDIO_SUSTAINABILITY_DOC);
  return { ...base, purpose: t.purpose, design: { ...base.design, templateId: String(t.id), templateVersion: t.version } };
};

const firstFreeform = (doc: ReportDoc): FreeformPage => doc.pages.find((p): p is FreeformPage => p.kind === "freeform") as FreeformPage;
const LAYOUTS: ReportLayout[] = [
  { id: 1, companyId: null, kind: "ghg", format: "a4", pageKind: "cover", name: "GHG cover", thumbnailUrl: null, page: firstFreeform(STUDIO_GHG_DOC), slug: "ghg-inventory/cover", family: "ghg-inventory", role: "cover", sort: 1 },
  { id: 2, companyId: null, kind: "ghg", format: "a4", pageKind: "data_page", name: "Executive summary", thumbnailUrl: null, page: STUDIO_GHG_DOC.pages[1] as FreeformPage, slug: "ghg-inventory/exec_summary", family: "ghg-inventory", role: "exec_summary", sort: 3 },
  { id: 3, companyId: null, kind: "sustainability", format: "a4", pageKind: "cover", name: "Annual report cover", thumbnailUrl: null, page: firstFreeform(STUDIO_SUSTAINABILITY_DOC), slug: "sustainability-editorial/cover", family: "sustainability-editorial", role: "cover", sort: 1 },
  { id: 4, companyId: null, kind: "sustainability", format: "a4", pageKind: "highlights", name: "Highlights", thumbnailUrl: null, page: STUDIO_SUSTAINABILITY_DOC.pages[1] as FreeformPage, slug: "sustainability-editorial/highlights", family: "sustainability-editorial", role: "highlights", sort: 5 },
];

const ELEMENTS: ElementTemplate[] = [
  {
    id: 1,
    companyId: null,
    group: "shapes",
    name: "Rectangle",
    tags: ["box"],
    license: "own",
    payload: { id: "tpl-rect", type: "shape", frame: { x: 0, y: 0, w: 40, h: 30, rotation: 0 }, z: 0, source: "user", props: { shape: "rect", fill: "#0F5132" } },
  },
  {
    id: 2,
    companyId: null,
    group: "frames",
    name: "Circle frame",
    tags: ["photo"],
    license: "own",
    payload: { id: "tpl-frame", type: "frame", frame: { x: 0, y: 0, w: 40, h: 40, rotation: 0 }, z: 0, source: "user", props: { mask: "circle", fit: "cover", alt: "" } },
  },
  {
    id: 3,
    companyId: null,
    group: "data",
    name: "Total emissions",
    tags: ["ghg", "big number"],
    license: "own",
    payload: {
      id: "tpl-total",
      type: "big_number",
      frame: { x: 0, y: 0, w: 60, h: 25, rotation: 0 },
      z: 0,
      source: "user",
      props: { binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" }, label: "tCO₂e", showDelta: true },
    },
  },
  { id: 4, companyId: null, group: "icons", name: "Leaf", tags: ["icon", "nature", "esg"], license: "lucide-isc", payload: { id: "tpl-leaf", type: "icon", frame: { x: 0, y: 0, w: 12, h: 12, rotation: 0 }, z: 0, source: "user", props: { name: "lucide:leaf" } } },
  { id: 5, companyId: null, group: "sdg", name: "SDG 13: Climate action", tags: ["sdg", "climate"], license: "sdg-colours", payload: { id: "tpl-sdg13", type: "sdg", frame: { x: 0, y: 0, w: 20, h: 20, rotation: 0 }, z: 0, source: "user", props: { goal: 13, variant: "full" } } },
  // DS-4: a line and an editable group (ESG graphic), as seeded.
  { id: 6, companyId: null, group: "lines", name: "Arrow", tags: ["line", "arrow"], license: "own", payload: { id: "el", type: "line", frame: { x: 0, y: 0, w: 60, h: 4, rotation: 0 }, z: 1, source: "user", props: { x1: 0, y1: 2, x2: 60, y2: 2, strokeWidth: 0.8, dash: "solid", endArrow: true } } },
  {
    id: 7,
    companyId: null,
    group: "esg",
    name: "Scope circles",
    tags: ["esg", "scope", "diagram"],
    license: "own",
    payload: {
      type: "group",
      w: 100,
      h: 40,
      elements: [
        { id: "s1", type: "shape", frame: { x: 0, y: 0, w: 40, h: 40, rotation: 0 }, z: 1, source: "user", props: { shape: "ellipse", opacity: 0.3 } },
        { id: "s2", type: "shape", frame: { x: 60, y: 0, w: 40, h: 40, rotation: 0 }, z: 2, source: "user", props: { shape: "ellipse", opacity: 0.6 } },
      ],
    },
  },
];

// DS-3: the shape GET /studio/styles answers for the mock brand kit (ESG-lite brandkit/styles.ts).
const STYLES: StylePreset[] = [
  { id: "brand", name: "ACME · Fraunces", palette: ["#0f5132", "#f59e0b", "#111827", "#ffffff", "#5f6b7c"], fonts: { heading: "fraunces", body: "source-sans-3" } },
  { id: "brand-alt-1", name: "ACME · DM Serif Display", palette: ["#0f5132", "#f59e0b", "#111827", "#ffffff", "#5f6b7c"], fonts: { heading: "dm-serif-display", body: "source-sans-3" } },
  { id: "brand-alt-2", name: "ACME · Archivo", palette: ["#0f5132", "#f59e0b", "#111827", "#ffffff", "#5f6b7c"], fonts: { heading: "archivo", body: "ibm-plex-sans" } },
  { id: "look-classic", name: "Classic · Fraunces", palette: ["#0f5132", "#f59e0b", "#16202e", "#ffffff", "#5f6b7c"], fonts: { heading: "fraunces", body: "source-sans-3" } },
  { id: "look-light", name: "Light · Fraunces", palette: ["#0f5132", "#f59e0b", "#1f2937", "#f8fafc", "#64748b"], fonts: { heading: "fraunces", body: "source-sans-3" } },
  { id: "look-night", name: "Night · Fraunces", palette: ["#5c8c75", "#f59e0b", "#f1f5f9", "#0d1526", "#94a3b8"], fonts: { heading: "fraunces", body: "source-sans-3" } },
  { id: "neutral-graphite", name: "Graphite", palette: ["#1f2937", "#0f766e", "#111827", "#ffffff", "#4b5563"], fonts: { heading: "ibm-plex-serif", body: "ibm-plex-sans" } },
];

/** WCAG ratio of a pair (the mock's own copy; the app uses src/theme/color.ts). */
const mockRatio = (a: string, b: string): number => {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const mockPaletteContrast = (colors: string[]): PaletteContrast[] =>
  colors.flatMap((a, i) => colors.slice(i + 1).map((b) => {
    const ratio = mockRatio(a, b);
    return { a, b, ratio, text: ratio >= 4.5, graphic: ratio >= 3 };
  }));
const mockBrandKit = (): BrandKit => {
  const colors = ["#0f5132", "#f59e0b", "#111827", "#ffffff"];
  return {
    name: "ACME",
    logos: { primary: "/brand/logo.svg", onDark: "/brand/logo-white.svg" },
    colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" },
    defaultLook: "classic",
    fonts: { heading: "fraunces", body: "source-sans-3" },
    voice: "",
    palettes: [{ id: 1, name: "Primary", colors, sort: 0, contrast: mockPaletteContrast(colors) }],
    canEdit: true,
    brandControls: false,
    updatedAt: null,
  };
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const brandKitIssues = (b: Partial<BrandKitUpdate>): { path: string; message: string }[] => {
  const out: { path: string; message: string }[] = [];
  if (typeof b.voice === "string" && b.voice.length > 3000) out.push({ path: "voice", message: "At most 3,000 characters" });
  if (b.fonts) for (const k of ["heading", "body"] as const) if (b.fonts[k] !== null && !(FONT_IDS as readonly unknown[]).includes(b.fonts[k])) out.push({ path: `fonts.${k}`, message: "Pick a font from the list" });
  if (b.palettes && b.palettes.length > 20) out.push({ path: "palettes", message: "At most 20 palettes" });
  (b.palettes ?? []).forEach((p, i) => {
    if (!p.name?.trim()) out.push({ path: `palettes.${i}.name`, message: "Name the palette" });
    if (!p.colors?.length || p.colors.length > 10) out.push({ path: `palettes.${i}.colors`, message: "1 to 10 colours" });
    (p.colors ?? []).forEach((c, j) => { if (!HEX.test(c)) out.push({ path: `palettes.${i}.colors.${j}`, message: "Use a hex colour like #1A2B3C" }); });
  });
  return out;
};

/** DS-3: the mock caller's role (`canEdit` false = an Admin: PUT answers DS_ROLE) and DS-13's brand controls. */
export function setStudioMockBrandKit(patch: Partial<BrandKit>): void {
  state.brandKit = { ...state.brandKit, ...patch };
}
/** DS-3: the stored brand kit (tests read back what PUT saved). */
export function studioMockBrandKit(): BrandKit {
  return state.brandKit;
}

interface State {
  enabled: boolean;
  kpi: boolean;
  docs: Map<number, DocRow>;
  nextDoc: number;
  materiality: MaterialTopic[]; // DS-2
  brandKit: BrandKit;
  assets: StudioAsset[];
  nextAsset: number;
  jobs: Map<number, MockJob>;
  nextJob: number;
  shares: MockShare[];
  nextShare: number;
  comments: ReportComment[];
  nextComment: number;
  approvals: ReportApproval[];
  nextApproval: number;
  templates: ReportTemplate[];
  layouts: ReportLayout[];
  aiCalls: number;
  nextPalette: number; // DS-3
}

const docRow = (id: number, doc: ReportDoc, inputs: ReportInputs = {}): DocRow => ({
  id,
  doc: clone(doc),
  rev: 1,
  status: "draft",
  inputs,
  updatedAt: NOW,
  sourceDocId: null,
  deleted: false,
  versions: [],
  templateId: null, // DS-5
  build: null,
  buildPolls: 0,
});

const initialState = (): State => ({
  enabled: true,
  kpi: true,
  docs: new Map([
    [
      1,
      docRow(1, STUDIO_GHG_DOC, {
        consolidation_approach: { value: "operational control", source: "company", updatedBy: null, updatedAt: NOW },
        reporting_period: { value: "1 January to 31 December 2025", source: "company", updatedBy: null, updatedAt: NOW },
        conformance: { value: ["GHGP", "ISO14064"], source: "typed", updatedBy: 2, updatedAt: NOW },
      }),
    ],
    [2, docRow(2, STUDIO_SUSTAINABILITY_DOC, { leadership_message: { value: "A year of steady progress.", source: "typed", updatedBy: 2, updatedAt: NOW } })],
  ]),
  nextDoc: 3,
  materiality: [
    { esrs_topic: "E1", name: "Climate change", material: true, impact_score: 8, financial_score: 7.5 },
    { esrs_topic: "S1", name: "Own workforce", material: true, impact_score: null, financial_score: null },
    { esrs_topic: "E3", name: "Water and marine resources", material: false, impact_score: null, financial_score: null },
  ], // DS-2
  brandKit: mockBrandKit(), // DS-3
  assets: [
    { id: "a-plant", kind: "image", w: 2400, h: 1600, alt: "The Bahrain plant at dawn", folder: "Photos", url: "/mock/a-plant.jpg", bytes: 420000, mime: "image/jpeg", sha256: "a".repeat(64), createdAt: NOW },
    { id: "a-logo", kind: "logo", w: 600, h: 300, alt: "ACME logo", folder: null, url: "/mock/a-logo.png", bytes: 12000, mime: "image/png", sha256: "b".repeat(64), createdAt: NOW },
  ],
  nextAsset: 1,
  jobs: new Map(),
  nextJob: 1,
  shares: [],
  nextShare: 1,
  comments: [],
  nextComment: 1,
  approvals: [],
  nextApproval: 1,
  templates: clone(TEMPLATES),
  layouts: clone(LAYOUTS),
  aiCalls: 0,
  nextPalette: 2, // DS-3
});

let state = initialState();

/** Restores the sample (switch on, KPI tracking on, docs 1 and 2). */
export function resetStudioMocks(): void {
  state = initialState();
  imageGen = false; // DS-4
  BUILD_POLLS = 2; // DS-5
  JOB_POLLS = 1; // DS-11
  finalBlocked = false; // DS-11
  resizeDataVersion = 1; // DS-10
}
// DS-10: the mock's approved data version; bumping it makes every resized copy's source "changed".
let resizeDataVersion = 1;
export function setStudioMockSourceDataChanged(): void {
  resizeDataVersion += 1;
}
// DS-4: whether POST /studio/assets/generate has an image provider (off by default, as in CI).
let imageGen = false;
export function setStudioMockImageGen(on: boolean): void {
  imageGen = on;
}
/** The company's `design_studio_enabled`. */
export function setStudioMockEnabled(enabled: boolean): void {
  state.enabled = enabled;
}
/** The company's `kpi_tracking_enabled` (the sustainability kind). */
export function setStudioMockKpi(enabled: boolean): void {
  state.kpi = enabled;
}
/** The stored doc row (tests read back what a handler saved). */
export function studioMockDoc(id: number): { doc: ReportDoc; rev: number; status: ReportStatus; inputs: ReportInputs } | undefined {
  const row = state.docs.get(id);
  return row && !row.deleted ? { doc: row.doc, rev: row.rev, status: row.status, inputs: row.inputs } : undefined;
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_STUDIO_OFF: "Design Studio isn't turned on for this company.",
  DS_KIND_OFF: "Sustainability reports need KPI tracking, which isn't turned on for this company.",
  DS_DOC_NOT_FOUND: "Not found.",
  DS_VERSION_CONFLICT: "Someone else changed this design. Reload to see their changes.",
  DS_VALIDATION: "The request isn't valid.",
  DS_ROLE: "Your role can't do this.", // DS-3
};
/** Typed as a plain Response so a handler may answer an error or its own typed body. */
const error = (code: DsErrorCode, details?: unknown): Response =>
  HttpResponse.json<DsErrorBody>(details === undefined ? { code, message: MESSAGES[code] ?? code } : { code, message: MESSAGES[code] ?? code, details }, { status: DS_ERROR_STATUS[code] });

const body = async <T,>(request: Request): Promise<Partial<T>> => {
  try {
    return ((await request.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
};

/** null when the call may go on; else the error response (switch first, then kind). */
const gate = (kind?: unknown): Response | null => {
  if (!state.enabled) return error("DS_STUDIO_OFF");
  if (kind === "sustainability" && !state.kpi) return error("DS_KIND_OFF");
  return null;
};

/** The doc behind `:id`, or the error response. */
const loadDoc = (rawId: unknown): DocRow | Response => {
  const off = gate();
  if (off) return off;
  const row = state.docs.get(Number(rawId));
  if (!row || row.deleted) return error("DS_DOC_NOT_FOUND");
  const kindOff = gate(row.doc.kind);
  return kindOff ?? row;
};
const isResponse = (v: unknown): v is Response => v instanceof Response;

// DS-11: render jobs finish after JOB_POLLS polls of GET /jobs/:id (0 = at once).
interface MockJob extends ReportJob {
  pollsLeft: number;
  note: string | null;
}
interface MockShare extends ReportShare {
  token: string;
}
let JOB_POLLS = 1;
let finalBlocked = false;
const JOB_FILES: Record<JobKind, string> = { proof: "proof.pdf", print: "print.pdf", png: "pages.zip", thumbnail: "thumbnail.png", final: "final.pdf" };
const mockVersion = (row: DocRow, kind: ReportVersion["kind"], note: string | null): ReportVersion => {
  const n = row.versions.reduce((m, v) => Math.max(m, v.n), 0) + 1;
  return { id: row.id * 1000 + n, n, kind, rev: row.rev, note, createdAt: NOW, createdBy: "Maya Manager", pageCount: row.doc.pages.length, pdfUrl: kind === "final" ? `/studio/docs/${row.id}/versions/${n}/pdf` : null, pdfSha256: kind === "final" ? "c".repeat(64) : null, dataHash: "sha256:mock", rendererHash: "mock", superseded: false };
};
function finishJob(job: MockJob): void {
  const row = state.docs.get(job.docId);
  job.status = "done";
  job.startedAt = NOW;
  job.finishedAt = NOW;
  job.pageCount = job.kind === "png" && job.options?.pages ? job.options.pages[1] - job.options.pages[0] + 1 : (row?.doc.pages.length ?? 1);
  job.bytes = 120_000;
  job.downloadUrl = `/studio/jobs/${job.id}/file`;
  if (job.kind === "final" && row) {
    row.versions.forEach((v) => {
      if (v.kind === "final") v.superseded = true;
    });
    const v = { ...mockVersion(row, "final", job.note), rev: job.rev };
    row.versions.push(v);
    job.versionId = v.id;
    job.versionN = v.n;
    job.fileName = `ACME-GHG-Report-${row.doc.meta.year}-v${v.n}.pdf`;
  } else {
    job.expiresAt = new Date(Date.parse(NOW) + 7 * 86_400_000).toISOString();
    job.fileName = `ACME-GHG-Report-${row?.doc.meta.year ?? 2025}-${JOB_FILES[job.kind]}`;
  }
}
const publicJob = ({ pollsLeft: _p, note: _n, ...job }: MockJob): ReportJob => job;
const publicShare = ({ token: _t, ...share }: MockShare): ReportShare => share;
/** How many GET /jobs/:id polls a render job takes (0 = done at once). */
export function setStudioMockJobPolls(n: number): void {
  JOB_POLLS = n;
}
/** A final answers DS_CHECKS_BLOCKING (pending entries) while on. */
export function setStudioMockFinalBlocked(on: boolean): void {
  finalBlocked = on;
}
/** A job's state (tests make one fail). */
export function setStudioMockJobFailed(id: number, reason: string): void {
  const job = state.jobs.get(id);
  if (job) Object.assign(job, { status: "failed", errorCode: "DS_JOB_FAILED", errorReason: reason, downloadUrl: null, pollsLeft: 0 });
}
/** The view links made so far, with their tokens (tests open them). */
export function studioMockShares(): { id: number; docId: number; token: string; state: ReportShare["state"]; views: number }[] {
  return state.shares.map((s) => ({ id: s.id, docId: s.docId, token: s.token, state: s.state, views: s.views }));
}

const summary = (row: DocRow): StudioDocSummary => ({
  id: row.id,
  kind: row.doc.kind,
  purpose: row.doc.purpose,
  format: row.doc.format,
  title: row.doc.meta.title,
  year: row.doc.meta.year,
  yearType: row.doc.meta.yearType,
  status: row.status,
  rev: row.rev,
  pageCount: row.doc.pages.length,
  templateId: row.templateId,
  sourceDocId: row.sourceDocId,
  finalVersion: row.versions.filter((v) => v.kind === "final").reduce<number | null>((n, v) => Math.max(n ?? 0, v.n), null),
  buildState: row.build?.state ?? null,
  createdAt: NOW,
  updatedAt: row.updatedAt,
  updatedBy: "Maya Manager",
  thumbnailUrl: null,
});
const docResponse = (row: DocRow): StudioDocResponse => ({ id: row.id, doc: row.doc, rev: row.rev, status: row.status, title: row.doc.meta.title, dataHash: "sha256:mock", updatedAt: row.updatedAt, build: row.build });
const docBuild = (row: DocRow): StudioDocBuild => ({ id: row.id, rev: row.rev, status: row.status, title: row.doc.meta.title, build: row.build });

/** DS-5: the build steps as the backend reports them (all done, or the first `done` of them). */
const buildProgress = (ai: boolean, pageCount: number, done = 6): BuildProgress => {
  const ids = ["template", "data", "layout", "inputs", "ai", "save"] as const;
  const labels = ["Loading the template", "Reading your approved data", "Laying out the pages", "Filling in report details", "Writing text with AI", "Saving the design"];
  return {
    state: done >= ids.length ? "done" : "running",
    steps: ids.map((id, i) => ({
      id,
      label: labels[i],
      state: id === "ai" && !ai ? "skipped" : i < done ? "done" : i === done ? "running" : "pending",
      ...(id === "ai" && ai ? { note: "AI drafting isn't available yet; the template's text is kept." } : {}),
    })),
    dropped: [],
    pageCount: done >= ids.length ? pageCount : null,
    startedAt: NOW,
    finishedAt: done >= ids.length ? NOW : null,
  };
};
/** DS-5: how many ?build=1 polls a background build takes (tests may set 0). */
let BUILD_POLLS = 2;
export function setStudioMockBuildPolls(n: number): void {
  BUILD_POLLS = n;
}

const addDoc = (doc: ReportDoc, inputs: ReportInputs = {}, sourceDocId: number | null = null): DocRow => {
  const row = { ...docRow(state.nextDoc++, doc, inputs), sourceDocId };
  state.docs.set(row.id, row);
  return row;
};

/** A made-up display string per binding (mock data, never a reported figure). DS-2: the real shapes of src/studio/sources. */
const resolveOne = (b: Binding, i: number): ResolvedBinding => {
  if (b.source === "custom") return { display: "Unlinked data", value: null, unit: null, source: "custom" };
  if (b.source === "input") return { display: "From report details", value: null, unit: null, source: "input" };
  if (b.source === "ghg" && b.metric === "scope2_market")
    return { display: "Not reported", value: null, unit: "tCO₂e", source: "ghg", unavailable: { reason: "NOT_RECORDED", detail: "Market-based Scope 2 isn't recorded (D7)." } };
  const value = 1000 + i * 111;
  return {
    display: value.toLocaleString("en-GB"),
    value,
    unit: b.source === "ghg" ? "tCO₂e" : (b.unit ?? null),
    source: b.source,
    approvedAt: "2026-04-12T00:00:00.000Z",
    series: [{ label: "2025", values: [{ key: "2025", value }] }],
    ...(b.source === "ghg" ? { approvedEntries: 42 } : { evidenceCount: 3 }), // DS-7: chip hover card
    // DS-8: GHG breakdowns and year ranges in DS-2's series shapes, so the GHG charts draw.
    ...(b.source === "ghg" ? mockGhgShape(b, value) : {}),
  };
};

/** DS-8 · made-up series in DS-2's shapes: one series per year keyed by the breakdown (top n folds into Other), months stacked by scope. */
const MOCK_BREAKDOWN: Record<string, [string, number][]> = {
  scope: [["Scope 1", 3410], ["Scope 2", 5800], ["Scope 3", 3270]],
  scope3_category: [["1 · Purchased goods and services", 1290], ["4 · Upstream transportation and distribution", 620], ["6 · Business travel", 410], ["7 · Employee commuting", 300], ["5 · Waste generated in operations", 210], ["3 · Fuel- and energy-related activities", 180], ["2 · Capital goods", 140], ["9 · Downstream transportation and distribution", 70], ["12 · End-of-life treatment of sold products", 50]],
  site: [["Bahrain plant", 6900], ["Sitra warehouse", 2380], ["Head office", 1200]],
  gas: [["CO₂", 8350], ["CH₄", 19.8], ["N₂O", 2.9]],
  source_category: [["Stationary combustion", 2100], ["Mobile combustion", 900], ["Fugitive", 410]],
  fuel: [["Diesel", 1500], ["Natural gas", 1200], ["Petrol", 300]],
  quarter: [["Q1", 3000], ["Q2", 3100], ["Q3", 3300], ["Q4", 3080]],
  month: Array.from({ length: 12 }, (_, m) => [`2025-${String(m + 1).padStart(2, "0")}`, 950 + ((m * 37) % 160)] as [string, number]),
};
function mockGhgShape(b: GhgBinding, value: number): Partial<ResolvedBinding> {
  const yr = b.years;
  const years = Array.isArray(yr) ? [...yr].sort((x, y) => x - y) : Array.from({ length: yr.last }, (_, k) => 2025 - yr.last + 1 + k);
  const scale = (y: number) => 1 + (2025 - y) * 0.04;
  if (b.breakdown && MOCK_BREAKDOWN[b.breakdown]) {
    let pts = MOCK_BREAKDOWN[b.breakdown];
    if (b.top && pts.length > b.top) pts = [...pts.slice(0, b.top), ["Other", pts.slice(b.top).reduce((a, p) => a + p[1], 0)]];
    const series = years.map((y) => ({ label: String(y), values: pts.map(([key, v]) => ({ key: b.breakdown === "month" ? `${y}-${key.slice(5)}` : key, value: Math.round(v * scale(y) * 10) / 10 })) }));
    const stacks =
      b.breakdown === "month" || b.breakdown === "quarter"
        ? ["Scope 1", "Scope 2", "Scope 3"].filter((s) => b.metric === "total" || (b.metric === "scope1" && s === "Scope 1") || (b.metric === "scope2_location" && s === "Scope 2") || (b.metric === "scope3" && s === "Scope 3")).map((label, k) => ({ label, values: series[series.length - 1].values.map((p) => ({ key: p.key, value: Math.round(((p.value ?? 0) * [0.27, 0.46, 0.27][k]) * 10) / 10 })) }))
        : undefined;
    return { series, total: value, ...(stacks ? { stacks } : {}) };
  }
  if (years.length > 1) return { series: [{ label: "Total", values: years.map((y) => ({ key: String(y), value: Math.round(value * scale(y)) })) }] };
  return {};
}

/** DS-2: matrix points only when every material topic is scored (as src/studio/sources/materiality.ts). */
const materialityPoints = (topics: MaterialTopic[]): MaterialityResponse["points"] => {
  const m = topics.filter((t) => t.material);
  if (!m.length || m.some((t) => t.impact_score === null || t.financial_score === null)) return null;
  return m.map((t) => ({ topic: t.esrs_topic, label: t.name, impact: t.impact_score as number, financial: t.financial_score as number }));
};

/** DS-2: the Data drawer list (made-up values). */
const ghgItem = (id: string, label: string, binding: GhgBinding, i: number): DataItem => {
  const r = resolveOne(binding, i);
  return { id, label, binding, resolved: { display: r.display, value: r.value, unit: r.unit, approvedAt: r.approvedAt ?? null, ...(r.unavailable ? { unavailable: r.unavailable } : {}) } };
};
const g = (metric: GhgBinding["metric"], extra: Partial<GhgBinding> = {}): GhgBinding => ({ source: "ghg", metric, years: { last: 1 }, sites: "all", ...extra });
export const MOCK_GHG_DATA: DataGroup[] = [
  {
    id: "scopes",
    label: "Scopes",
    items: [
      ghgItem("total", "Total emissions", g("total"), 0),
      ghgItem("scope1", "Scope 1", g("scope1"), 1),
      ghgItem("scope2_location", "Scope 2 (location-based)", g("scope2_location"), 2),
      ghgItem("scope2_market", "Scope 2 (market-based)", g("scope2_market"), 3),
      ghgItem("scope3", "Scope 3", g("scope3"), 4),
    ],
  },
  {
    id: "scope3_categories",
    label: "Scope 3 categories",
    items: [
      ghgItem("scope3_category_1", "1 · Purchased goods and services", g("scope3_category", { scope3Category: 1 }), 5),
      {
        id: "scope3_category_8",
        label: "8 · Upstream leased assets",
        binding: g("scope3_category", { scope3Category: 8 }),
        resolved: { display: "Excluded: No leased assets", value: null, unit: "tCO₂e", approvedAt: null, unavailable: { reason: "EXCLUDED", detail: "No leased assets" } },
      },
    ],
  },
  { id: "breakdowns", label: "Sites, months and sources", items: [ghgItem("by_site", "Total by site", g("total", { breakdown: "site" }), 6)] },
  {
    id: "gases",
    label: "Gases",
    items: [{ id: "gas_ch4", label: "CH₄", binding: g("gas_ch4"), resolved: { display: "Not reported", value: null, unit: "t CH₄", approvedAt: null, unavailable: { reason: "NOT_TRACKED" } } }],
  },
  { id: "intensity", label: "Intensity", items: [ghgItem("intensity_output", "Intensity per unit of output", g("intensity_output"), 7)] },
  { id: "base_year", label: "Base year and quality", items: [ghgItem("base_year_total", "Base year (Scope 3)", g("base_year_total"), 8)] },
];
const MOCK_KPIS: { code: string; name: string; topic: string }[] = [
  { code: "WATER_WITHDRAWAL", name: "Water withdrawal", topic: "water" },
  { code: "ENERGY_TOTAL", name: "Total energy consumption", topic: "energy" },
  { code: "EMPLOYEES_TOTAL", name: "Total employees", topic: "workforce" },
];
const kpiData = (q: string | null, topic: string | null): DataGroup[] => {
  const hits = MOCK_KPIS.filter((k) => (!q || `${k.code} ${k.name}`.toLowerCase().includes(q.toLowerCase())) && (!topic || k.topic === topic));
  const topics = [...new Set(hits.map((k) => k.topic))];
  return topics.map((t) => ({
    id: t,
    label: t.replace(/^./, (c) => c.toUpperCase()),
    items: hits
      .filter((k) => k.topic === t)
      .map((k, i) => {
        const binding: KpiBinding = { source: "kpi", kpis: [k.code], years: { last: 1 }, sites: "all" };
        const r = resolveOne(binding, i);
        return { id: k.code, label: k.name, binding, resolved: { display: r.display, value: r.value, unit: r.unit, approvedAt: r.approvedAt ?? null, complete: true } };
      }),
  }));
};
const ghgPrefill = (): InputPrefill => ({
  reporting_period: { value: "Financial year 2025 (1 April 2024 – 31 March 2025)", source: "company" },
  consolidation_approach: { value: "Operational control", source: "company" },
  gwp_set: { value: "AR6", source: "company" },
  conformance: { value: ["GHGP"], source: "company" },
  revenue: { value: 2300, source: "kpi", note: "INR crore" },
  exclusions: { value: [{ what: "Category 8 · Upstream leased assets", reason: "No leased assets" }], source: "company" },
});

const suggestion = (action: AiAction): Suggestion => ({
  id: `sug-${++state.aiCalls}`,
  action,
  model: action.startsWith("rewrite") ? "google/gemini-3-flash-preview" : "anthropic/claude-sonnet-5.5",
  createdAt: NOW,
  kind: action === "honesty_check" || action === "jargon_check" || action === "missing_disclosures" ? "findings" : "text",
  payload:
    action === "honesty_check" || action === "jargon_check" || action === "missing_disclosures"
      ? { findings: [{ message: "The summary says emissions fell, but Scope 3 grew.", pageId: "p-summary", severity: "warning" }] }
      : {
          text: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Total emissions were " },
                  { type: "data", attrs: { binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" }, measure: "value" } },
                  { type: "text", text: " tCO₂e." },
                ],
              },
            ],
          },
        },
  sources: [{ source: "ghg", metric: "total", year: 2025 }],
});

const PREVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body><main data-mock="studio-preview"><section class="sheet" data-page-id="p-cover"><h1>Preview</h1></section></main></body></html>`;

export const studioHandlers = [
  // Status: answers while the switch is off.
  http.get("*/studio/status", () => HttpResponse.json<StudioStatus>({ enabled: state.enabled, kinds: { ghg: state.enabled, sustainability: state.enabled && state.kpi } })),

  // DS-5 readiness
  http.get("*/studio/readiness", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "ghg";
    const off = gate(kind);
    if (off) return off;
    const year = Number(url.searchParams.get("year") ?? 2025);
    const yearType = (url.searchParams.get("yearType") ?? "CY") as YearType;
    const periodLabel = yearType === "FY" ? `FY ${year - 1}–${String(year).slice(-2)}` : String(year);
    if (kind === "sustainability") {
      return HttpResponse.json<SustainabilityReadiness>({
        kind: "sustainability",
        year,
        yearType,
        periodLabel,
        setupDone: true,
        locked: false,
        lockedAt: null,
        coverage: [
          { framework: "GRI", pct: 82 },
          { framework: "BRSR", pct: 64 },
        ],
        missing: [{ kpi: "WATER_WITHDRAWAL", name: "Water withdrawal", sites: [2], periods: ["Nov 2025", "Dec 2025"] }],
        pendingCount: 4,
        state: "almost",
        gaps: [
          { kind: "kpi_missing", severity: "warning", message: `1 KPI value set is missing for ${periodLabel}.`, link: "/kpi/dashboard", linkLabel: "Open KPI dashboard", count: 1 },
          { kind: "year_not_locked", severity: "error", message: `${periodLabel} isn't locked yet. A final needs the year locked.`, link: "/kpi/dashboard", linkLabel: "Lock the year" },
        ],
      });
    }
    return HttpResponse.json<GhgReadiness>({
      kind: "ghg",
      year,
      yearType,
      periodLabel,
      approvedRows: 1284,
      pendingRows: 4,
      rejectedRows: 0,
      sitesCovered: 2,
      sitesTotal: 3,
      sitesMissing: [{ id: 3, name: "Pune warehouse" }],
      monthsCovered: 12,
      monthsExpected: 12,
      monthsMissing: [],
      scope3Addressed: "11/15",
      scope3: { reported: [1, 3, 4, 5, 6, 7, 9, 12], excluded: [2, 11, 15], unaddressed: [8, 10, 13, 14] },
      state: "almost",
      gaps: [
        { kind: "pending_entries", severity: "error", message: "4 entries wait for approval. A final needs them approved.", link: "/data/approvals", linkLabel: "Open Review", count: 4 },
        { kind: "site_no_data", severity: "warning", message: `Pune warehouse has no approved data for ${periodLabel}.`, link: "/data/ledger?site=3", linkLabel: "Open site", siteId: 3 },
        { kind: "scope3_unaddressed", severity: "warning", message: "Categories 8, 10, 13 and 14 are neither reported nor excluded.", link: "/settings/scope3/screening", linkLabel: "Scope 3 screening", categories: [8, 10, 13, 14] },
      ],
    });
  }),

  // DS-3 brand kit and styles
  http.get("*/studio/brand-kit", () => gate() ?? HttpResponse.json<BrandKit>(state.brandKit)),
  http.put("*/studio/brand-kit", async ({ request }) => {
    const off = gate();
    if (off) return off;
    if (!state.brandKit.canEdit) return error("DS_ROLE");
    const b = await body<BrandKitUpdate>(request);
    const issues = brandKitIssues(b);
    if (issues.length) return error("DS_VALIDATION", { issues });
    let palettes = state.brandKit.palettes;
    if (b.palettes) {
      const owned = new Set(palettes.map((p) => p.id));
      if (b.palettes.some((p) => p.id !== undefined && !owned.has(p.id))) return error("DS_DOC_NOT_FOUND");
      palettes = b.palettes.map((p, sort) => {
        const colors = p.colors.map((c) => c.toLowerCase());
        return { id: p.id ?? state.nextPalette++, name: p.name.trim(), colors, sort, contrast: mockPaletteContrast(colors) };
      });
    }
    state.brandKit = { ...state.brandKit, fonts: b.fonts ?? state.brandKit.fonts, voice: b.voice ?? state.brandKit.voice, palettes, updatedAt: NOW };
    return HttpResponse.json<BrandKit>(state.brandKit);
  }),
  http.get("*/studio/styles", ({ request }) => {
    const kind = new URL(request.url).searchParams.get("kind");
    if (!kind) return gate() ?? error("DS_VALIDATION", { issues: [{ path: "kind", message: "kind must be ghg or sustainability" }] });
    return gate(kind) ?? HttpResponse.json<StylePreset[]>(STYLES);
  }),

  // DS-4 library
  http.get("*/studio/templates", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const off = gate(kind);
    if (off) return off;
    const format = url.searchParams.get("format");
    const q = url.searchParams.get("q")?.toLowerCase();
    const tag = url.searchParams.get("tag");
    return HttpResponse.json<ReportTemplate[]>(
      state.templates.filter(
        (t) =>
          (!kind || t.kind === kind) &&
          (!format || t.format === format) &&
          (!q || [t.name, t.description ?? "", ...t.tags].some((x) => x.toLowerCase().includes(q))) && // DS-4: name, description and tags
          (!tag || t.tags.includes(tag)) &&
          (state.kpi || t.kind === "ghg"),
      ),
    );
  }),
  http.post("*/studio/templates/from-doc", async ({ request }) => {
    const off = gate();
    if (off) return off;
    const b = await body<{ docId: number; name: string }>(request);
    const row = state.docs.get(Number(b.docId));
    if (!row) return error("DS_DOC_NOT_FOUND");
    const t: ReportTemplate = { id: state.templates.length + 1, companyId: 1, kind: row.doc.kind, purpose: row.doc.purpose, format: row.doc.format, name: b.name ?? "My template", tags: [], version: 1, thumbnailUrl: null, pageCount: row.doc.pages.length };
    state.templates.push(t);
    return HttpResponse.json(t, { status: 201 });
  }),
  http.get("*/studio/templates/:id", ({ params }) => {
    const t = state.templates.find((x) => x.id === Number(params.id));
    if (!t) return gate() ?? error("DS_LAYOUT_NOT_FOUND");
    return gate(t.kind) ?? HttpResponse.json<ReportTemplateDetail>({ ...t, doc: templateDoc(t) });
  }),
  http.get("*/studio/layouts", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const off = gate(kind);
    if (off) return off;
    const format = url.searchParams.get("format");
    const pageKind = url.searchParams.get("pageKind");
    const template = url.searchParams.get("template"); // DS-4: a family, or a template slug naming one
    const family = template ? (state.templates.find((t) => t.slug === template)?.family ?? template) : null;
    return HttpResponse.json<ReportLayout[]>(
      state.layouts.filter((l) => (!kind || l.kind === kind) && (!format || l.format === format) && (!pageKind || l.pageKind === pageKind) && (!family || l.family === family) && (state.kpi || l.kind === "ghg")),
    );
  }),
  http.post("*/studio/layouts/from-page", async ({ request }) => {
    const off = gate();
    if (off) return off;
    const b = await body<{ docId: number; pageId: string; name: string; kind: ReportLayout["pageKind"] }>(request);
    const row = state.docs.get(Number(b.docId));
    const page = row?.doc.pages.find((p) => p.id === b.pageId);
    if (!row || !page || page.kind !== "freeform") return error("DS_DOC_NOT_FOUND");
    const layout: ReportLayout = { id: state.layouts.length + 1, companyId: 1, kind: row.doc.kind, format: row.doc.format, pageKind: b.kind ?? "data_page", name: b.name ?? page.name, thumbnailUrl: null, page };
    state.layouts.push(layout);
    return HttpResponse.json(layout, { status: 201 });
  }),
  http.get("*/studio/elements", ({ request }) => {
    const off = gate();
    if (off) return off;
    const url = new URL(request.url);
    const group = url.searchParams.get("group");
    const q = url.searchParams.get("q")?.toLowerCase();
    return HttpResponse.json<ElementTemplate[]>(ELEMENTS.filter((e) => (!group || e.group === group) && (!q || e.name.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q)))));
  }),
  http.post("*/studio/assets", async ({ request }) => {
    const off = gate();
    if (off) return off;
    let name = "upload.png";
    let folder: string | null = null;
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (file && typeof file === "object" && "name" in file) name = String((file as File).name);
      folder = (form.get("folder") as string | null) ?? null;
    } catch {
      // A JSON body in a unit test: keep the defaults.
    }
    if (!/\.(png|jpe?g|webp|svg)$/i.test(name)) return error("DS_ASSET_TYPE");
    const asset: StudioAsset = { id: `up-${state.nextAsset++}`, kind: "image", w: 1200, h: 800, alt: "", folder, url: `/mock/${name}`, bytes: 50000, mime: "image/png", sha256: "c".repeat(64), createdAt: NOW };
    state.assets.push(asset);
    return HttpResponse.json(asset, { status: 201 });
  }),
  http.get("*/studio/assets", ({ request }) => {
    const off = gate();
    if (off) return off;
    const folder = new URL(request.url).searchParams.get("folder");
    return HttpResponse.json<StudioAsset[]>(state.assets.filter((a) => !folder || a.folder === folder));
  }),
  http.delete("*/studio/assets/:id", ({ params }) => {
    const off = gate();
    if (off) return off;
    const before = state.assets.length;
    state.assets = state.assets.filter((a) => a.id !== params.id);
    return before === state.assets.length ? error("DS_DOC_NOT_FOUND") : new HttpResponse(null, { status: 204 });
  }),
  // DS-4 additions: move or rename an asset, and AI images (503 unless setStudioMockImageGen(true)).
  http.patch("*/studio/assets/:id", async ({ params, request }) => {
    const off = gate();
    if (off) return off;
    const a = state.assets.find((x) => x.id === params.id);
    if (!a) return error("DS_DOC_NOT_FOUND");
    const b = await body<{ folder: string | null; alt: string }>(request);
    if (typeof b.folder === "string" && /[/\\<>]/.test(b.folder)) return error("DS_VALIDATION", { issues: [{ path: "folder", message: "A folder name can't contain / \\ < or >" }] });
    if (b.folder !== undefined) a.folder = b.folder || null;
    if (b.alt !== undefined) a.alt = b.alt;
    return HttpResponse.json<StudioAsset>(a);
  }),
  http.post("*/studio/assets/generate", async ({ request }) => {
    const off = gate();
    if (off) return off;
    const b = await body<{ prompt: string; folder: string }>(request);
    if (!b.prompt || b.prompt.trim().length < 3) return error("DS_VALIDATION", { issues: [{ path: "prompt", message: "Describe the image" }] });
    if (!imageGen) return error("DS_AI_UNAVAILABLE");
    const asset: StudioAsset = { id: `ai-${state.nextAsset++}`, kind: "ai_image", w: 1536, h: 1024, alt: b.prompt.slice(0, 500), folder: b.folder || "AI images", url: "/mock/ai.png", bytes: 80000, mime: "image/png", sha256: "d".repeat(64), createdAt: NOW };
    state.assets.unshift(asset);
    return HttpResponse.json(asset, { status: 201 });
  }),

  // DS-2 resolve and report inputs
  http.post("*/studio/resolve", async ({ request }) => {
    const b = await body<{ kind: ReportKind; bindings: Binding[]; tokens: { attrs: { binding: Binding } }[] }>(request);
    const off = gate(b.kind);
    if (off) return off;
    const values = (b.bindings ?? []).map(resolveOne);
    const tokens = (b.tokens ?? []).map((t, i) => resolveOne(t.attrs.binding, i));
    const unavailable = values.flatMap((v, i) => (v.unavailable ? [{ bindingIdx: i, reason: v.unavailable.reason }] : [])); // DS-2: reason codes
    return HttpResponse.json<ResolveResponse>({ values, tokens, dataHash: `sha256:mock-${values.length}-${tokens.length}`, unavailable });
  }),
  http.get("*/studio/docs/:id/inputs", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    return HttpResponse.json<DocInputsResponse>({ rev: row.rev, inputs: row.inputs, prefill: row.doc.kind === "ghg" ? ghgPrefill() : {} });
  }),
  http.patch("*/studio/docs/:id/inputs", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ rev: number; inputs: InputsPatch }>(request);
    if (b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    // DS-2: per-key entries; null removes a key; source defaults to typed.
    const next: Record<string, unknown> = { ...row.inputs };
    const issues: { path: string; message: string }[] = [];
    for (const [k, v] of Object.entries(b.inputs ?? {})) {
      if (v === null) delete next[k];
      else if (typeof v.value === "number" && v.value < 0) issues.push({ path: `inputs.${k}`, message: "Number must be greater than or equal to 0" });
      else next[k] = { value: v.value, source: v.source ?? "typed", updatedBy: 2, updatedAt: NOW };
    }
    if (issues.length) return error("DS_VALIDATION", { issues });
    row.inputs = next as ReportInputs;
    row.rev += 1;
    return HttpResponse.json<DocInputsResponse>({ rev: row.rev, inputs: row.inputs, prefill: row.doc.kind === "ghg" ? ghgPrefill() : {} });
  }),
  // DS-2 additions: prefill before a doc exists, the Data drawer list, materiality scores
  http.get("*/studio/inputs/prefill", ({ request }) => {
    const kind = new URL(request.url).searchParams.get("kind") as ReportKind | null;
    const off = gate(kind);
    if (off) return off;
    return HttpResponse.json<InputsPrefillResponse>({ keys: inputKeysFor(kind ?? "ghg"), prefill: kind === "ghg" ? ghgPrefill() : { reporting_period: { value: "Calendar year 2025 (1 January 2025 – 31 December 2025)", source: "company" } } });
  }),
  http.get("*/studio/data", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as ReportKind | null;
    const off = gate(kind);
    if (off) return off;
    const year = Number(url.searchParams.get("year") ?? 2025);
    const groups = kind === "sustainability" ? kpiData(url.searchParams.get("q"), url.searchParams.get("topic")) : MOCK_GHG_DATA;
    return HttpResponse.json<DataCatalogResponse>({ kind: kind ?? "ghg", year, yearType: (url.searchParams.get("yearType") as YearType) ?? "CY", siteIds: [1, 2], groups });
  }),
  http.get("*/studio/materiality", () => {
    const off = gate("sustainability");
    if (off) return off;
    return HttpResponse.json<MaterialityResponse>({ topics: state.materiality, points: materialityPoints(state.materiality) });
  }),
  http.put("*/studio/materiality", async ({ request }) => {
    const off = gate("sustainability");
    if (off) return off;
    const b = await body<{ scores: { esrs_topic: string; impact_score: number | null; financial_score: number | null }[] }>(request);
    for (const sc of b.scores ?? []) {
      const t = state.materiality.find((x) => x.esrs_topic === sc.esrs_topic);
      if (!t) return error("DS_DOC_NOT_FOUND");
      t.impact_score = sc.impact_score;
      t.financial_score = sc.financial_score;
    }
    return HttpResponse.json<MaterialityResponse>({ topics: state.materiality, points: materialityPoints(state.materiality) });
  }),

  // DS-5 docs
  http.get("*/studio/docs", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const off = gate(kind);
    if (off) return off;
    const year = url.searchParams.get("year");
    const rows = [...state.docs.values()].filter(
      (r) => !r.deleted && (!kind || r.doc.kind === kind) && (!year || r.doc.meta.year === Number(year)) && (state.kpi || r.doc.kind === "ghg"),
    );
    return HttpResponse.json<StudioDocSummary[]>(rows.map(summary));
  }),
  http.post("*/studio/docs", async ({ request }) => {
    const b = await body<CreateDocBody>(request);
    const off = gate(b.kind);
    if (off) return off;
    if (!b.kind || !b.year || !b.yearType || b.templateId === undefined) return error("DS_VALIDATION", { issues: [{ path: "templateId", message: "Required" }] });
    let doc: ReportDoc;
    let templateId: number | null = null;
    if (b.templateId === "blank") {
      const format = b.format ?? "a4";
      doc = clone(STUDIO_GHG_DOC);
      doc.kind = b.kind;
      doc.format = format;
      doc.purpose = format === "slide_16_9" ? "deck" : "report";
      doc.meta.frameworks = b.kind === "ghg" ? ["GHGP"] : ["GRI"];
      doc.design = { templateId: "blank", templateVersion: 1, theme: {} };
      doc.pages = [{ id: "p1", kind: "freeform", name: "Page 1", background: {}, elements: [] }];
    } else {
      const t = state.templates.find((x) => x.id === Number(b.templateId) && x.kind === b.kind);
      if (!t) return error("DS_LAYOUT_NOT_FOUND");
      doc = templateDoc(t);
      templateId = t.id;
      doc.meta.title = `${t.name} ${b.yearType === "FY" ? `FY ${b.year - 1}–${String(b.year).slice(-2)}` : b.year}`;
    }
    doc.meta = { ...doc.meta, year: b.year, yearType: b.yearType, sites: b.sites ?? "all", ...(b.frameworks?.length ? { frameworks: b.frameworks } : {}), ...(b.compareYear ? { compareYear: b.compareYear } : {}) };
    if (b.title) doc.meta.title = b.title;
    const inputs = Object.fromEntries(Object.entries(b.inputs ?? {}).filter(([, v]) => v).map(([k, v]) => [k, { value: (v as { value: unknown }).value, source: "typed", updatedBy: 2, updatedAt: NOW }])) as ReportInputs;
    const row = addDoc(doc, inputs);
    row.templateId = templateId;
    if (new URL(request.url).searchParams.get("wait") === "0" && BUILD_POLLS > 0) {
      row.build = buildProgress(!!b.ai, doc.pages.length, 1);
      row.buildPolls = BUILD_POLLS;
      return HttpResponse.json<StudioDocBuild>(docBuild(row), { status: 202 });
    }
    row.build = buildProgress(!!b.ai, doc.pages.length);
    if (new URL(request.url).searchParams.get("wait") === "0") return HttpResponse.json<StudioDocBuild>(docBuild(row), { status: 202 });
    return HttpResponse.json<StudioDocResponse>(docResponse(row), { status: 201 });
  }),
  http.get("*/studio/docs/:id", ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    if (new URL(request.url).searchParams.get("build") === "1") {
      // DS-5: a background build moves one step per poll, then reports done.
      if (row.build && row.build.state === "running") {
        row.buildPolls -= 1;
        const done = row.buildPolls <= 0 ? 6 : 6 - row.buildPolls;
        row.build = buildProgress(row.build.steps.some((s) => s.id === "ai" && s.state !== "skipped"), row.doc.pages.length, done);
      }
      return HttpResponse.json<StudioDocBuild>(docBuild(row));
    }
    return HttpResponse.json<StudioDocResponse>(docResponse(row));
  }),
  http.patch("*/studio/docs/:id", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ rev: number; doc?: ReportDoc; title?: string }>(request);
    if (row.status === "final") return error("DS_FINAL_IMMUTABLE");
    if (b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    if (!b.doc && !b.title) return error("DS_VALIDATION", { issues: [{ path: "doc", message: "Send doc or title" }] });
    if (b.doc && (b.doc.schemaVersion !== 2 || b.doc.kind !== row.doc.kind)) return error("DS_DOC_INVALID", { issues: [{ path: "doc", message: "Not a v2 doc of this kind" }] });
    row.doc = b.doc ? b.doc : clone(row.doc);
    if (b.title) row.doc.meta.title = b.title; // DS-5: rename
    row.rev += 1;
    row.updatedAt = new Date().toISOString();
    return HttpResponse.json<StudioDocResponse>(docResponse(row));
  }),
  http.delete("*/studio/docs/:id", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    row.deleted = true;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/studio/docs/:id/rebuild", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    row.rev += 1;
    return HttpResponse.json<StudioDocResponse>(docResponse(row));
  }),
  http.post("*/studio/docs/:id/presence", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.json({ others: 0 });
  }),
  http.post("*/studio/docs/:id/duplicate", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ title: string }>(request);
    const doc = clone(row.doc);
    doc.meta.title = b.title ?? `${doc.meta.title} (copy)`;
    return HttpResponse.json({ id: addDoc(doc, clone(row.inputs)).id }, { status: 201 });
  }),

  // DS-10 resize: the real engine (src/lib/studio/resize.ts), as the server runs it.
  http.post("*/studio/docs/:id/resize", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<ResizeBody>(request);
    if (!b.format || !b.purpose) return error("DS_VALIDATION");
    const dataHash = `sha256:mock-${resizeDataVersion}`;
    const title = b.title ?? `${row.doc.meta.title} · copy`;
    const r = resizeDocument(clone(row.doc) as unknown as Record<string, unknown>, { purpose: b.purpose, format: b.format, pageIds: b.pageIds, title, sizes: PAGE_FORMAT_SIZES, link: { docId: row.id, rev: row.rev, dataHash } });
    if (!r.ok) return error(r.error === "FORMAT_INVALID" ? "DS_FORMAT_INVALID" : r.error === "UNSUPPORTED" ? "DS_RESIZE_UNSUPPORTED" : "DS_VALIDATION");
    const made = addDoc(r.doc as unknown as ReportDoc, clone(row.inputs), row.id);
    const res: ResizeResponse = { id: made.id, title, pageCount: r.doc.pages.length, dropped: r.report.dropped.length, truncated: r.report.truncated.length, summarised: 0 };
    return HttpResponse.json(res, { status: 201 });
  }),
  http.get("*/studio/docs/:id/source", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const link = row.doc.source;
    if (!link) return HttpResponse.json({ source: null } satisfies LinkedSourceResponse);
    const src = state.docs.get(link.docId);
    const exists = !!src && !src.deleted;
    const current = `sha256:mock-${resizeDataVersion}`;
    const out: LinkedSource = {
      docId: link.docId,
      exists,
      title: exists ? src.doc.meta.title : null,
      rev: link.rev,
      dataHash: link.dataHash,
      currentRev: exists ? src.rev : null,
      currentDataHash: exists ? current : null,
      dataChanged: exists && current !== link.dataHash,
    };
    return HttpResponse.json({ source: out } satisfies LinkedSourceResponse);
  }),

  // DS-11 preview, jobs, versions, shares (and the public /s/:token)
  http.get("*/studio/docs/:id/preview.html", ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const mode = new URL(request.url).searchParams.get("mode") ?? "paged";
    const pages = row.doc.pages.map((p) => `<section class="${p.kind === "flow" ? "ds-flow" : "ds-sheet"}" data-page-id="${p.id}"><h1>${p.name}</h1></section>`).join("");
    return HttpResponse.text(PREVIEW_HTML.replace('data-mock="studio-preview"', `data-mock="studio-preview" data-mode="${mode}"`).replace(/<section.*<\/section>/, pages), {
      headers: { "content-type": "text/html; charset=utf-8", "x-doc-rev": String(row.rev) },
    });
  }),
  http.post("*/studio/docs/:id/jobs", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<CreateJobBody>(request);
    if (b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    if (b.kind === "final") {
      if (finalBlocked) return error("DS_CHECKS_BLOCKING", { checks: [{ id: "GHG_PENDING_ENTRIES", severity: "error", count: 4, message: "Pending entries: 4. Approve them in Review before the final.", link: "/data/approvals" }] });
      if (row.versions.some((v) => v.kind === "final") && !b.note) return error("DS_VALIDATION", { issues: [{ path: "note", message: "Say what changed since the last final" }] });
    }
    const id = state.nextJob++;
    const kind = (b.kind ?? "proof") as JobKind;
    const job: MockJob = {
      id,
      docId: row.id,
      versionId: null,
      versionN: null,
      kind,
      status: "queued",
      errorCode: null,
      errorReason: null,
      requestedBy: 2,
      rev: row.rev,
      createdAt: NOW,
      startedAt: null,
      finishedAt: null,
      downloadUrl: null,
      fileName: null,
      bytes: null,
      pageCount: null,
      expiresAt: null,
      ...(b.options ? { options: b.options } : {}),
      pollsLeft: JOB_POLLS,
      note: b.note ?? null,
    };
    state.jobs.set(id, job);
    if (job.pollsLeft <= 0) finishJob(job);
    return HttpResponse.json<ReportJob>(publicJob(job), { status: 202 });
  }),
  http.get("*/studio/docs/:id/jobs", ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const kind = new URL(request.url).searchParams.get("kind");
    const list = [...state.jobs.values()].filter((j) => j.docId === row.id && (!kind || j.kind === kind)).reverse();
    return HttpResponse.json<ReportJob[]>(list.map(publicJob));
  }),
  http.get("*/studio/jobs/:id", ({ params }) => {
    const off = gate();
    if (off) return off;
    const job = state.jobs.get(Number(params.id));
    if (!job) return error("DS_DOC_NOT_FOUND");
    if (job.status === "queued" || job.status === "running") {
      job.pollsLeft -= 1;
      if (job.pollsLeft <= 0) finishJob(job);
      else job.status = "running";
    }
    return HttpResponse.json<ReportJob>(publicJob(job));
  }),
  http.get("*/studio/jobs/:id/file", ({ params }) => {
    const off = gate();
    if (off) return off;
    const job = state.jobs.get(Number(params.id));
    if (!job || job.status !== "done") return error("DS_DOC_NOT_FOUND");
    const zip = job.kind === "png";
    return new HttpResponse(new TextEncoder().encode(zip ? "PK\u0005\u0006mock" : "%PDF-1.7\n% mock\n"), {
      headers: { "content-type": zip ? "application/zip" : "application/pdf", "content-disposition": `attachment; filename="${job.fileName}"` },
    });
  }),
  http.get("*/studio/docs/:id/versions", ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const kind = new URL(request.url).searchParams.get("kind");
    return HttpResponse.json<ReportVersion[]>(row.versions.filter((v) => !kind || v.kind === kind).slice().reverse());
  }),
  http.post("*/studio/docs/:id/versions", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ note: string }>(request);
    if (!b.note) return error("DS_VALIDATION", { issues: [{ path: "note", message: "Required" }] });
    const version = mockVersion(row, "snapshot", b.note);
    row.versions.push(version);
    return HttpResponse.json<ReportVersion>(version, { status: 201 });
  }),
  http.post("*/studio/docs/:id/versions/:n/restore", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ rev: number }>(request);
    if (!row.versions.some((v) => v.n === Number(params.n))) return error("DS_DOC_NOT_FOUND");
    if (b.rev !== undefined && b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    row.status = "draft";
    row.rev += 1;
    return HttpResponse.json<StudioDocResponse>(docResponse(row));
  }),
  http.get("*/studio/docs/:id/versions/:n/pdf", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const v = row.versions.find((x) => x.n === Number(params.n));
    if (!v?.pdfUrl) return error("DS_DOC_NOT_FOUND");
    return new HttpResponse(new TextEncoder().encode("%PDF-1.7\n% mock\n"), { headers: { "content-type": "application/pdf" } });
  }),
  http.post("*/studio/docs/:id/shares", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<CreateShareBody>(request);
    const days = b.expiresInDays ?? SHARE_DAYS_DEFAULT;
    if (days < 1 || days > SHARE_DAYS_MAX) return error("DS_VALIDATION", { issues: [{ path: "expiresInDays", message: "1 to 90 days" }] });
    const version = b.versionId ? row.versions.find((v) => v.id === b.versionId) : undefined;
    const proof = b.jobId ? state.jobs.get(b.jobId) : undefined;
    if ((b.versionId && !version) || (b.jobId && (!proof || proof.docId !== row.id))) return error("DS_DOC_NOT_FOUND");
    if (!version && !proof) return error("DS_VALIDATION", { issues: [{ path: "versionId", message: "Pick a final version or a proof" }] });
    const id = state.nextShare++;
    const token = `mock-token-${id}`.padEnd(43, "x");
    const share: MockShare = {
      id,
      docId: row.id,
      versionId: version?.id ?? null,
      versionN: version?.n ?? null,
      jobId: proof?.id ?? null,
      label: version ? `Final v${version.n}` : "Proof · 20 Oct 2026",
      expiresAt: new Date(Date.parse(NOW) + days * 86_400_000).toISOString(),
      revokedAt: null,
      views: 0,
      lastViewedAt: null,
      createdAt: NOW,
      createdBy: "Maya Manager",
      state: "active",
      token,
    };
    state.shares.push(share);
    return HttpResponse.json<ReportShare>({ ...publicShare(share), url: `https://app.example/s/${token}` }, { status: 201 });
  }),
  http.get("*/studio/docs/:id/shares", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    return HttpResponse.json<ReportShare[]>(state.shares.filter((s) => s.docId === row.id).reverse().map(publicShare));
  }),
  http.delete("*/studio/shares/:id", ({ params }) => {
    const off = gate();
    if (off) return off;
    const share = state.shares.find((s) => s.id === Number(params.id));
    if (!share) return error("DS_DOC_NOT_FOUND");
    share.revokedAt = NOW;
    share.state = "revoked";
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/s/:token/meta", ({ params }) => {
    const share = state.shares.find((s) => s.token === params.token);
    if (!share) return error("DS_DOC_NOT_FOUND");
    if (share.state !== "active" || !state.enabled) return error("DS_SHARE_EXPIRED");
    share.views += 1;
    const row = state.docs.get(share.docId);
    return HttpResponse.json<PublicShareMeta>({ title: row?.doc.meta.title ?? "Report", company: "ACME Metals", logoUrl: null, label: share.label, expiresAt: share.expiresAt, pageCount: row?.doc.pages.length ?? null, fileUrl: `/s/${share.token}/file` });
  }),
  http.get("*/s/:token/file", ({ params }) => {
    const share = state.shares.find((s) => s.token === params.token);
    if (!share) return error("DS_DOC_NOT_FOUND");
    if (share.state !== "active" || !state.enabled) return error("DS_SHARE_EXPIRED");
    return new HttpResponse(new TextEncoder().encode("%PDF-1.7\n% mock\n"), { headers: { "content-type": "application/pdf" } });
  }),

  // DS-9 AI
  http.post("*/studio/docs/:id/ai/chat", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    await body<{ messages: unknown[] }>(request);
    return HttpResponse.json<ChatReply>({ reply: "Here is a shorter summary based on your approved data.", suggestions: [suggestion("rewrite_shorter")] });
  }),
  http.get("*/studio/docs/:id/ai/usage", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.json<AiUsage>({ todayUsd: 0.42, budgetUsd: 5, calls: state.aiCalls, callBudget: 200, monthUsd: 3.1, monthBudgetUsd: 50 });
  }),
  http.post("*/studio/docs/:id/ai", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ action: AiAction }>(request);
    if (!b.action) return error("DS_VALIDATION", { issues: [{ path: "action", message: "Required" }] });
    return HttpResponse.json<Suggestion>(suggestion(b.action));
  }),

  // DS-12 checks
  http.post("*/studio/docs/:id/checks", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const checks: Check[] =
      row.doc.kind === "ghg"
        ? [
            { id: "SCOPE2_MARKET_MISSING", severity: "warning", pageId: "p-summary", elementId: "p-summary.market", message: "Market-based Scope 2 isn't reported." },
            { id: "UNLINKED_DATA", severity: "info", pageId: "p-scope3", elementId: "p-scope3.custom", message: "Typed data, not linked." },
          ]
        : [{ id: "YEAR_NOT_LOCKED", severity: "error", message: "Lock the year's KPI values before making a final." }];
    return HttpResponse.json<ChecksResponse>({ checks, blocking: checks.some((c) => c.severity === "error") });
  }),

  // DS-13 drift, comments, tasks, approvals
  http.get("*/studio/docs/:id/drift", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.json<DriftResponse>({ changed: [] });
  }),
  http.get("*/studio/docs/:id/comments", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.json<ReportComment[]>(state.comments.filter((c) => c.docId === row.id));
  }),
  http.post("*/studio/docs/:id/comments", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ pageId: string; elementId?: string; parentId?: number; body: string; mentions?: number[] }>(request);
    if (!b.body?.trim() || !b.pageId) return error("DS_VALIDATION", { issues: [{ path: "body", message: "Required" }] });
    const comment: ReportComment = {
      id: state.nextComment++,
      docId: row.id,
      pageId: b.pageId,
      elementId: b.elementId ?? null,
      parentId: b.parentId ?? null,
      body: b.body,
      authorId: 2,
      authorName: "Maya Manager",
      mentions: b.mentions ?? [],
      taskAssigneeId: null,
      taskDoneAt: null,
      resolvedAt: null,
      createdAt: NOW,
    };
    state.comments.push(comment);
    return HttpResponse.json(comment, { status: 201 });
  }),
  http.patch("*/studio/comments/:id/task", async ({ params, request }) => {
    const off = gate();
    if (off) return off;
    const c = state.comments.find((x) => x.id === Number(params.id));
    if (!c) return error("DS_DOC_NOT_FOUND");
    const b = await body<{ done: boolean }>(request);
    c.taskDoneAt = b.done ? NOW : null;
    return HttpResponse.json(c);
  }),
  http.post("*/studio/comments/:id/task", async ({ params, request }) => {
    const off = gate();
    if (off) return off;
    const c = state.comments.find((x) => x.id === Number(params.id));
    if (!c) return error("DS_DOC_NOT_FOUND");
    const b = await body<{ assigneeId: number }>(request);
    c.taskAssigneeId = Number(b.assigneeId);
    return HttpResponse.json(c);
  }),
  http.patch("*/studio/comments/:id", async ({ params, request }) => {
    const off = gate();
    if (off) return off;
    const c = state.comments.find((x) => x.id === Number(params.id));
    if (!c) return error("DS_DOC_NOT_FOUND");
    const b = await body<{ resolved: boolean }>(request);
    c.resolvedAt = b.resolved ? NOW : null;
    return HttpResponse.json(c);
  }),
  http.post("*/studio/docs/:id/approvals", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ reviewerId: number; dueAt?: string; note?: string }>(request);
    const approval: ReportApproval = { id: state.nextApproval++, docId: row.id, rev: row.rev, requestedBy: 3, reviewerId: Number(b.reviewerId), dueAt: b.dueAt ?? null, state: "requested", note: b.note ?? null, decidedAt: null };
    state.approvals.push(approval);
    row.status = "in_review";
    return HttpResponse.json<ReportApproval>(approval, { status: 201 });
  }),
  http.post("*/studio/approvals/:id/decide", async ({ params, request }) => {
    const off = gate();
    if (off) return off;
    const a = state.approvals.find((x) => x.id === Number(params.id));
    if (!a) return error("DS_DOC_NOT_FOUND");
    const b = await body<{ decision: "approved" | "changes_requested"; note?: string }>(request);
    a.state = b.decision === "approved" ? "approved" : "changes_requested";
    a.note = b.note ?? a.note;
    a.decidedAt = NOW;
    const row = state.docs.get(a.docId);
    if (row) row.status = a.state === "approved" ? "approved" : "draft";
    return HttpResponse.json<ReportApproval>(a);
  }),
  http.delete("*/studio/approvals/:id", ({ params }) => {
    const off = gate();
    if (off) return off;
    const before = state.approvals.length;
    state.approvals = state.approvals.filter((a) => a.id !== Number(params.id));
    return before === state.approvals.length ? error("DS_DOC_NOT_FOUND") : new HttpResponse(null, { status: 204 });
  }),

  // DS-1 fonts (a stand-in WOFF2 header)
  http.get("*/studio/fonts/:file", () => gate() ?? new HttpResponse(new Uint8Array([0x77, 0x4f, 0x46, 0x32]), { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" } })),

  // Anything else under /studio: gated like the backend, then 404.
  http.all("*/studio/*", () => gate() ?? error("DS_DOC_NOT_FOUND")),
];
