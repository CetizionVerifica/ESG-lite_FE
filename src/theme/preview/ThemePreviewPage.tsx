import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, Circle, Info, X } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { chartTheme } from "../chartTheme";
import {
  accentIsFillOnly,
  buildTheme,
  contrastReport,
  statusClashes,
  toCssVars,
} from "../buildTheme";
import { PLANETPULSE, STORED_BRANDS } from "../packs";
import type { Look, ResolvedAppearance, ThemePack } from "../packs";
import { RAMP_STEPS, TOKEN_NAMES } from "../tokens";
import type { ThemeTokens, TokenName } from "../tokens";

interface Variant {
  id: string;
  label: string;
  pack: ThemePack;
  look: Look;
  appearance: ResolvedAppearance;
}

const MIDAL = STORED_BRANDS[1];

const CORE: Variant[] = [
  { id: "pp", label: "PlanetPulse", pack: PLANETPULSE, look: "light", appearance: "light" },
  { id: "midal-classic", label: "Midal Classic", pack: MIDAL, look: "classic", appearance: "light" },
  { id: "midal-light", label: "Midal Light", pack: MIDAL, look: "light", appearance: "light" },
  { id: "midal-night", label: "Midal Night", pack: MIDAL, look: "night", appearance: "dark" },
];

const OTHERS: Variant[] = [STORED_BRANDS[2], STORED_BRANDS[3], STORED_BRANDS[6]].flatMap((pack) =>
  (["classic", "light", "night"] as Look[]).map((look) => ({
    id: `${pack.id}-${look}`,
    label: `${pack.name} ${look[0].toUpperCase()}${look.slice(1)}`,
    pack,
    look,
    appearance: (look === "night" ? "dark" : "light") as ResolvedAppearance,
  })),
);

const GROUPS: { title: string; names: TokenName[] }[] = [
  { title: "Surface", names: ["page", "panel", "ink", "muted", "line", "tint"] },
  { title: "Brand", names: ["brand", "on-brand", "brand-text", "accent", "on-accent"] },
  { title: "Chrome", names: ["chrome", "chrome-fg", "chrome-muted", "chrome-line", "chrome-active"] },
  { title: "Data", names: TOKEN_NAMES.filter((n) => /^(s\d|series-)/.test(n)) },
  { title: "Status", names: ["good", "good-soft", "warn", "warn-soft", "bad", "bad-soft", "info", "info-soft"] },
  { title: "Cover", names: ["cover-from", "cover-to"] },
];

function Swatch({ name, value }: { name: TokenName; value: string }) {
  return (
    <li className="flex items-center gap-2 py-0.5">
      <span
        className="size-4 shrink-0 rounded-chip border border-line"
        style={{ background: `var(--t-${name})` }}
      />
      <code className="font-num text-xs">--t-{name}</code>
      <code className="ml-auto font-num text-xs text-muted">{value}</code>
    </li>
  );
}

function Ramp({ prefix }: { prefix: "brand" | "accent" }) {
  return (
    <div className="flex h-5 overflow-hidden rounded-chip" aria-label={`${prefix} ramp`}>
      {RAMP_STEPS.map((s) => (
        <span key={s} className="flex-1" title={`--t-${prefix}-${s}`} style={{ background: `var(--t-${prefix}-${s})` }} />
      ))}
    </div>
  );
}

function Pill({ tone, icon, label }: { tone: "good" | "warn" | "bad" | "info"; icon: ReactNode; label: string }) {
  const cls = {
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    info: "bg-info-soft text-info",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium ${cls}`}>{icon}{label}</span>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const SCOPE_DATA = [
  [1.3, 1.2, 1.4, 1.3, 1.2, 1.1],
  [4.1, 4.3, 3.9, 4.0, 3.8, 3.7],
  [44, 46, 43, 45, 42, 41],
];

function ScopeChart({ tokens }: { tokens: ThemeTokens }) {
  const theme = chartTheme(tokens);
  const scopes = [theme.scopes.s1, theme.scopes.s2, theme.scopes.s3];
  const option = {
    grid: { left: 36, right: 8, top: 28, bottom: 24 },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: MONTHS },
    yAxis: { type: "value" },
    series: ["Scope 1 (ktCO₂e)", "Scope 2", "Scope 3"].map((name, i) => ({
      name,
      type: "bar",
      stack: "scope",
      data: SCOPE_DATA[i],
      itemStyle: { color: scopes[i] },
    })),
  };
  return <ReactECharts option={option} theme={theme} style={{ height: 180 }} notMerge />;
}

function ThemeCard({ variant }: { variant: Variant }) {
  const tokens: ThemeTokens = buildTheme(variant.pack, variant.look, variant.appearance);
  const report = contrastReport(tokens);
  const failing = report.filter((p) => p.ratio < p.min);
  const clashes = statusClashes(variant.pack);
  return (
    <section
      data-testid={`theme-${variant.id}`}
      style={toCssVars(tokens) as CSSProperties}
      className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-page font-ui text-sm text-ink"
    >
      <header className="flex h-12 items-center gap-3 border-b border-chrome-line bg-chrome px-4 text-chrome-fg">
        <b className="min-w-0 truncate">{variant.pack.name}</b>
        <nav className="flex shrink-0 gap-1 text-xs">
          <span className="rounded-control bg-chrome-active px-2 py-1">Overview</span>
          <span className="px-2 py-1 text-chrome-muted">Data</span>
        </nav>
        <span className="ml-auto grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent">FA</span>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold">{variant.label}</h2>
        <div className="rounded-control border border-line bg-panel p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Net emissions</div>
          <div className="font-num text-xl font-medium tabular-nums">461,600 <small className="font-ui text-xs text-muted">tCO₂e</small></div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-chip">
            <span className="w-[8%] bg-s1" /><span className="w-[17%] bg-s2" /><span className="flex-1 bg-s3" />
          </div>
          <div className="mt-1 flex gap-3 text-xs text-muted">
            <span>■ <span className="text-s1">S1</span></span><span>■ <span className="text-s2">S2</span></span><span>■ <span className="text-s3">S3</span></span>
          </div>
        </div>

        <div className="rounded-control border border-line bg-panel p-2" data-testid="chart">
          <ScopeChart tokens={tokens} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-control bg-brand px-3 py-1.5 font-medium text-on-brand">Approve</button>
          <button type="button" className="rounded-control border border-line bg-panel px-3 py-1.5">Reject</button>
          <a href="#tokens" className="font-medium text-brand-text">View ledger ›</a>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill tone="good" icon={<Check size={12} aria-hidden />} label="Approved" />
          <Pill tone="warn" icon={<Circle size={10} aria-hidden />} label="Pending" />
          <Pill tone="bad" icon={<X size={12} aria-hidden />} label="Rejected" />
          <Pill tone="info" icon={<Info size={12} aria-hidden />} label="Info" />
        </div>

        <div className="rounded-control bg-tint p-3 text-xs">
          <b className="text-brand-text">Start from a bill.</b> <span className="text-muted">Drop the PDF and ESGLite fills the entry.</span>
        </div>

        <div className="h-row rounded-control border border-line bg-panel px-3 leading-[var(--row-h)]">
          Table row · <span className="font-num tabular-nums">3,913.0</span>
        </div>

        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="h-4 rounded-chip" style={{ background: `var(--t-series-${i + 1})` }} />
          ))}
        </div>
        <Ramp prefix="brand" />
        <Ramp prefix="accent" />
        <div
          className="h-10 rounded-control"
          style={{ background: "linear-gradient(135deg, var(--t-cover-from), var(--t-cover-to))" }}
        />

        <p className={`text-xs ${failing.length ? "text-bad" : "text-good"}`} data-testid="contrast-result">
          {failing.length
            ? `Contrast: ${failing.length} of ${report.length} pairs fail`
            : `Contrast: all ${report.length} pairs pass AA`}
        </p>
        <p className="text-xs text-muted">
          {accentIsFillOnly(tokens) ? "Accent is fill-only (fails as text). " : ""}
          {clashes.length ? `Brand hue is close to: ${clashes.join(", ")}; pills keep icon + label.` : "No status hue clash."}
        </p>

        <details id="tokens" className="rounded-control border border-line bg-panel p-3">
          <summary className="cursor-pointer font-medium">All tokens</summary>
          {GROUPS.map((g) => (
            <div key={g.title} className="mt-2">
              <div className="text-xs uppercase tracking-wide text-muted">{g.title}</div>
              <ul>{g.names.map((n) => <Swatch key={n} name={n} value={tokens[n]} />)}</ul>
            </div>
          ))}
        </details>
      </div>
    </section>
  );
}

/** Dev-only route (/dev/theme): every token in the four reference themes. */
export default function ThemePreviewPage() {
  const [showOthers, setShowOthers] = useState(false);
  const variants = showOthers ? [...CORE, ...OTHERS] : CORE;
  return (
    <main className="min-h-screen bg-page p-4 font-ui text-ink md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-semibold">Theme tokens</h1>
        <span className="text-sm text-muted">Generated by buildTheme() · dev only</span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
          Show the other stored brands (companies 2, 3, 6)
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {variants.map((v) => (
          <ThemeCard key={v.id} variant={v} />
        ))}
      </div>
    </main>
  );
}
