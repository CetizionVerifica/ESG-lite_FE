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
import sustainabilityFixture from "../fixtures/studio/sustainability-doc.json";
import {
  type AiAction,
  type AiUsage,
  type Binding,
  type BrandKit,
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
  type JobKind,
  type PageFormat,
  type ReportApproval,
  type ReportComment,
  type ReportDoc,
  type ReportInputs,
  type ReportJob,
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
}

const TEMPLATES: ReportTemplate[] = [
  { id: 1, companyId: null, kind: "ghg", purpose: "report", format: "a4", name: "Inventory (GHG Protocol)", tags: ["ghgp", "a4"], version: 1, thumbnailUrl: null, pageCount: 20 },
  { id: 2, companyId: null, kind: "ghg", purpose: "report", format: "a4", name: "ISO 14064-1", tags: ["iso"], version: 1, thumbnailUrl: null, pageCount: 22 },
  { id: 3, companyId: null, kind: "ghg", purpose: "deck", format: "slide_16_9", name: "Board brief", tags: ["deck"], version: 1, thumbnailUrl: null, pageCount: 9 },
  { id: 4, companyId: null, kind: "ghg", purpose: "summary", format: "a4", name: "One-page summary", tags: ["summary"], version: 1, thumbnailUrl: null, pageCount: 1 },
  { id: 5, companyId: null, kind: "sustainability", purpose: "report", format: "a4", name: "Annual report", tags: ["gri", "brsr"], version: 2, thumbnailUrl: null, pageCount: 36 },
];
const templateDoc = (t: ReportTemplate): ReportDoc => {
  const base = clone(t.kind === "ghg" ? STUDIO_GHG_DOC : STUDIO_SUSTAINABILITY_DOC);
  return { ...base, purpose: t.purpose, design: { ...base.design, templateId: String(t.id), templateVersion: t.version } };
};

const firstFreeform = (doc: ReportDoc): FreeformPage => doc.pages.find((p): p is FreeformPage => p.kind === "freeform") as FreeformPage;
const LAYOUTS: ReportLayout[] = [
  { id: 1, companyId: null, kind: "ghg", format: "a4", pageKind: "cover", name: "GHG cover", thumbnailUrl: null, page: firstFreeform(STUDIO_GHG_DOC) },
  { id: 2, companyId: null, kind: "ghg", format: "a4", pageKind: "data_page", name: "Executive summary", thumbnailUrl: null, page: STUDIO_GHG_DOC.pages[1] as FreeformPage },
  { id: 3, companyId: null, kind: "sustainability", format: "a4", pageKind: "cover", name: "Annual report cover", thumbnailUrl: null, page: firstFreeform(STUDIO_SUSTAINABILITY_DOC) },
  { id: 4, companyId: null, kind: "sustainability", format: "a4", pageKind: "highlights", name: "Highlights", thumbnailUrl: null, page: STUDIO_SUSTAINABILITY_DOC.pages[1] as FreeformPage },
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
  { id: 4, companyId: null, group: "icons", name: "Leaf", tags: ["nature"], license: "Lucide (ISC)", payload: { id: "tpl-leaf", type: "icon", frame: { x: 0, y: 0, w: 12, h: 12, rotation: 0 }, z: 0, source: "user", props: { name: "leaf" } } },
  { id: 5, companyId: null, group: "sdg", name: "SDG 13", tags: ["climate"], license: "UN SDG guidelines", payload: { id: "tpl-sdg13", type: "sdg", frame: { x: 0, y: 0, w: 20, h: 20, rotation: 0 }, z: 0, source: "user", props: { goal: 13, variant: "full" } } },
];

const STYLES: StylePreset[] = [
  { id: "brand-classic", name: "Brand classic", palette: ["#0F5132", "#F59E0B", "#111827", "#FFFFFF", "#6B7280"], fonts: { heading: "fraunces", body: "source-sans-3" } },
  { id: "plex", name: "Plex", palette: ["#1D4ED8", "#0EA5E9", "#0F172A", "#F8FAFC", "#64748B"], fonts: { heading: "ibm-plex-serif", body: "ibm-plex-sans" } },
];

interface State {
  enabled: boolean;
  kpi: boolean;
  docs: Map<number, DocRow>;
  nextDoc: number;
  brandKit: BrandKit;
  assets: StudioAsset[];
  nextAsset: number;
  jobs: Map<number, ReportJob>;
  nextJob: number;
  shares: (ReportShare & { docId: number })[];
  nextShare: number;
  comments: ReportComment[];
  nextComment: number;
  approvals: ReportApproval[];
  nextApproval: number;
  templates: ReportTemplate[];
  layouts: ReportLayout[];
  aiCalls: number;
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
  brandKit: {
    fonts: { heading: "fraunces", body: "source-sans-3" },
    voice: "",
    palettes: [{ id: 1, name: "Brand", colors: ["#0F5132", "#F59E0B", "#111827"], sort: 0 }],
    logos: { primary: "/brand/logo.svg", mark: null },
  },
  assets: [
    { id: "a-plant", kind: "image", w: 2400, h: 1600, alt: "The Bahrain plant at dawn", folder: "Photos", url: "/mock/a-plant.jpg", bytes: 420000, mime: "image/jpeg" },
    { id: "a-logo", kind: "logo", w: 600, h: 300, alt: "ACME logo", folder: null, url: "/mock/a-logo.png", bytes: 12000, mime: "image/png" },
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
});

let state = initialState();

/** Restores the sample (switch on, KPI tracking on, docs 1 and 2). */
export function resetStudioMocks(): void {
  state = initialState();
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
  updatedAt: row.updatedAt,
  updatedBy: "Maya Manager",
  thumbnailUrl: null,
  sourceDocId: row.sourceDocId,
});
const docResponse = (row: DocRow): StudioDocResponse => ({ id: row.id, doc: row.doc, rev: row.rev, status: row.status });

const addDoc = (doc: ReportDoc, inputs: ReportInputs = {}, sourceDocId: number | null = null): DocRow => {
  const row = { ...docRow(state.nextDoc++, doc, inputs), sourceDocId };
  state.docs.set(row.id, row);
  return row;
};

/** A made-up display string per binding (mock data, never a reported figure). */
const resolveOne = (b: Binding, i: number): ResolvedBinding & { unavailable?: string } => {
  if (b.source === "custom") return { display: "Unlinked data", value: null, unit: null, source: "custom" };
  if (b.source === "input") return { display: "From report details", value: null, unit: null, source: "input" };
  if (b.source === "ghg" && b.metric === "scope2_market") return { display: "Not reported", value: null, unit: "tCO₂e", source: "ghg", unavailable: "Market-based Scope 2 isn't recorded (D7)" };
  const value = 1000 + i * 111;
  return {
    display: value.toLocaleString("en-GB"),
    value,
    unit: b.source === "ghg" ? "tCO₂e" : (b.unit ?? null),
    source: b.source,
    approvedAt: "2026-04-12",
    series: [{ label: "2025", values: [{ key: "2025", value }] }],
  };
};

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
    if (kind === "sustainability") {
      return HttpResponse.json<SustainabilityReadiness>({
        kind: "sustainability",
        year,
        locked: false,
        lockedAt: null,
        coverage: [
          { framework: "GRI", pct: 82 },
          { framework: "BRSR", pct: 64 },
        ],
        missing: [{ kpi: "WATER_WITHDRAWAL", sites: [2], periods: ["2025-11", "2025-12"] }],
        pendingCount: 4,
      });
    }
    return HttpResponse.json<GhgReadiness>({
      kind: "ghg",
      approvedRows: 412,
      pendingRows: 3,
      sitesCovered: 2,
      monthsCovered: 12,
      scope3Addressed: "11/15",
      gaps: [{ category: 14, message: "Category 14 is neither reported nor excluded." }],
    });
  }),

  // DS-3 brand kit and styles
  http.get("*/studio/brand-kit", () => gate() ?? HttpResponse.json<BrandKit>(state.brandKit)),
  http.put("*/studio/brand-kit", async ({ request }) => {
    const off = gate();
    if (off) return off;
    const b = await body<BrandKit>(request);
    if (typeof b.voice === "string" && b.voice.length > 3000) return error("DS_VALIDATION", { issues: [{ path: "voice", message: "At most 3,000 characters" }] });
    state.brandKit = { ...state.brandKit, ...b, logos: state.brandKit.logos };
    return HttpResponse.json<BrandKit>(state.brandKit);
  }),
  http.get("*/studio/styles", ({ request }) => gate(new URL(request.url).searchParams.get("kind")) ?? HttpResponse.json<StylePreset[]>(STYLES)),

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
        (t) => (!kind || t.kind === kind) && (!format || t.format === format) && (!q || t.name.toLowerCase().includes(q)) && (!tag || t.tags.includes(tag)) && (state.kpi || t.kind === "ghg"),
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
    return HttpResponse.json<ReportLayout[]>(state.layouts.filter((l) => (!kind || l.kind === kind) && (!format || l.format === format) && (!pageKind || l.pageKind === pageKind)));
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
    const asset: StudioAsset = { id: `up-${state.nextAsset++}`, kind: "image", w: 1200, h: 800, alt: "", folder, url: `/mock/${name}`, bytes: 50000, mime: "image/png" };
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

  // DS-2 resolve and report inputs
  http.post("*/studio/resolve", async ({ request }) => {
    const b = await body<{ kind: ReportKind; bindings: Binding[]; tokens: { attrs: { binding: Binding } }[] }>(request);
    const off = gate(b.kind);
    if (off) return off;
    const values = (b.bindings ?? []).map(resolveOne);
    const tokens = (b.tokens ?? []).map((t, i) => resolveOne(t.attrs.binding, i));
    const unavailable = values.flatMap((v, i) => (v.unavailable ? [{ bindingIdx: i, reason: v.unavailable }] : []));
    return HttpResponse.json<ResolveResponse>({ values, tokens, dataHash: `sha256:mock-${values.length}-${tokens.length}`, unavailable });
  }),
  http.get("*/studio/docs/:id/inputs", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    return HttpResponse.json<DocInputsResponse>({
      rev: row.rev,
      inputs: row.inputs,
      prefill: row.doc.kind === "ghg" ? { consolidation_approach: { value: "operational control", source: "company" }, gwp_set: { value: "AR6", source: "company" } } : {},
    });
  }),
  http.patch("*/studio/docs/:id/inputs", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ rev: number; inputs: ReportInputs }>(request);
    if (b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    row.inputs = { ...row.inputs, ...(b.inputs ?? {}) };
    row.rev += 1;
    return HttpResponse.json<DocInputsResponse>({ rev: row.rev, inputs: row.inputs, prefill: {} });
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
    const b = await body<{ kind: ReportKind; templateId: number; year: number; yearType: "CY" | "FY"; inputs: ReportInputs }>(request);
    const off = gate(b.kind);
    if (off) return off;
    const t = state.templates.find((x) => x.id === Number(b.templateId) && x.kind === b.kind);
    if (!t) return error("DS_LAYOUT_NOT_FOUND");
    const doc = templateDoc(t);
    doc.meta = { ...doc.meta, year: b.year ?? doc.meta.year, yearType: b.yearType ?? doc.meta.yearType };
    return HttpResponse.json<StudioDocResponse>(docResponse(addDoc(doc, b.inputs ?? {})), { status: 201 });
  }),
  http.get("*/studio/docs/:id", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.json<StudioDocResponse>(docResponse(row));
  }),
  http.patch("*/studio/docs/:id", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ rev: number; doc: ReportDoc }>(request);
    if (row.status === "final") return error("DS_FINAL_IMMUTABLE");
    if (b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    if (!b.doc || b.doc.schemaVersion !== 2 || b.doc.kind !== row.doc.kind) return error("DS_DOC_INVALID", { issues: [{ path: "doc", message: "Not a v2 doc of this kind" }] });
    row.doc = b.doc;
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

  // DS-10 resize
  http.post("*/studio/docs/:id/resize", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ format: PageFormat; purpose: ReportDoc["purpose"]; title: string }>(request);
    if (!b.format) return error("DS_FORMAT_INVALID");
    if (b.purpose === "social" && row.doc.pages.every((p) => p.kind === "flow")) return error("DS_RESIZE_UNSUPPORTED");
    const doc: ReportDoc = { ...clone(row.doc), format: b.format, purpose: b.purpose ?? row.doc.purpose, source: { docId: row.id, rev: row.rev, dataHash: "sha256:mock" } };
    doc.meta.title = b.title ?? doc.meta.title;
    return HttpResponse.json({ id: addDoc(doc, clone(row.inputs), row.id).id }, { status: 201 });
  }),

  // DS-11 preview, jobs, versions, shares
  http.get("*/studio/docs/:id/preview.html", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.text(PREVIEW_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }),
  http.post("*/studio/docs/:id/jobs", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ kind: JobKind; rev: number; options?: ReportJob["options"] }>(request);
    if (b.rev !== row.rev) return error("DS_VERSION_CONFLICT", { rev: row.rev });
    const id = state.nextJob++;
    let versionId: number | null = null;
    if (b.kind === "final") {
      const n = row.versions.length + 1;
      row.versions.push({ n, kind: "final", note: null, createdAt: NOW, createdBy: "Maya Manager", pageCount: row.doc.pages.length, pdfUrl: `/mock/docs/${row.id}/versions/${n}.pdf`, dataHash: "sha256:mock" });
      row.status = "final";
      versionId = n;
    }
    const job: ReportJob = {
      id,
      docId: row.id,
      versionId,
      kind: b.kind ?? "proof",
      status: "done",
      errorCode: null,
      requestedBy: 2,
      startedAt: NOW,
      finishedAt: NOW,
      downloadUrl: `/mock/jobs/${id}.${b.kind === "png" ? "zip" : "pdf"}`,
      ...(b.options ? { options: b.options } : {}),
    };
    state.jobs.set(id, job);
    return HttpResponse.json<ReportJob>(job, { status: 202 });
  }),
  http.get("*/studio/jobs/:id", ({ params }) => {
    const off = gate();
    if (off) return off;
    const job = state.jobs.get(Number(params.id));
    return job ? HttpResponse.json<ReportJob>(job) : error("DS_DOC_NOT_FOUND");
  }),
  http.get("*/studio/docs/:id/versions", ({ params }) => {
    const row = loadDoc(params.id);
    return isResponse(row) ? row : HttpResponse.json<ReportVersion[]>(row.versions);
  }),
  http.post("*/studio/docs/:id/versions", async ({ params, request }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    const b = await body<{ note: string }>(request);
    const version: ReportVersion = { n: row.versions.length + 1, kind: "snapshot", note: b.note ?? null, createdAt: NOW, createdBy: "Maya Manager", pageCount: row.doc.pages.length, pdfUrl: null, dataHash: null };
    row.versions.push(version);
    return HttpResponse.json<ReportVersion>(version, { status: 201 });
  }),
  http.post("*/studio/docs/:id/versions/:n/restore", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    if (!row.versions.some((v) => v.n === Number(params.n))) return error("DS_DOC_NOT_FOUND");
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
    const b = await body<{ versionId: number; expiresInDays: number }>(request);
    const days = b.expiresInDays ?? 14;
    if (days < 1 || days > 90) return error("DS_VALIDATION", { issues: [{ path: "expiresInDays", message: "1 to 90 days" }] });
    const share = { id: state.nextShare++, docId: row.id, versionId: Number(b.versionId), expiresAt: new Date(Date.parse(NOW) + days * 86_400_000).toISOString(), revokedAt: null, views: 0 };
    state.shares.push(share);
    return HttpResponse.json<ReportShare>({ ...share, url: `https://app.example/s/mock-token-${share.id}` }, { status: 201 });
  }),
  http.get("*/studio/docs/:id/shares", ({ params }) => {
    const row = loadDoc(params.id);
    if (isResponse(row)) return row;
    return HttpResponse.json<ReportShare[]>(state.shares.filter((s) => s.docId === row.id).map(({ docId: _docId, ...s }) => s));
  }),
  http.delete("*/studio/shares/:id", ({ params }) => {
    const off = gate();
    if (off) return off;
    const share = state.shares.find((s) => s.id === Number(params.id));
    if (!share) return error("DS_DOC_NOT_FOUND");
    share.revokedAt = NOW;
    return new HttpResponse(null, { status: 204 });
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
