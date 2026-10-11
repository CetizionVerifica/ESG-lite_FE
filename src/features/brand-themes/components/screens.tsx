import type { CSSProperties, ReactNode } from "react";
import { Bell, Mail, Search } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  KpiStrip,
  PageHeader,
  PoweredBy,
  ScopeBar,
  StatusPill,
  TextField,
  cn,
} from "../../../ui";
import { type Look, type ThemePack, type ThemeTokens, textOnGradient, toCssVars } from "../../../theme";

/**
 * Applies a theme's tokens to its own subtree, so the real src/ui components
 * inside render in the draft theme while the rest of the page keeps the app's.
 */
export function ThemeScope({ tokens, dark, children, className }: { tokens: ThemeTokens; dark: boolean; children: ReactNode; className?: string }) {
  const style = { ...toCssVars(tokens), colorScheme: dark ? "dark" : "light" } as CSSProperties;
  return (
    <div style={style} data-testid="theme-scope" className={cn("bg-page text-ink", className)}>
      {children}
    </div>
  );
}

function logoFor(pack: ThemePack, onDark: boolean): string | null {
  return onDark ? pack.logoOnDarkUrl : pack.logoUrl;
}

function Wordmark({ pack, onDark, className }: { pack: ThemePack; onDark: boolean; className?: string }) {
  const src = logoFor(pack, onDark);
  return src ? (
    <img src={src} alt={pack.name} className={cn("h-6 w-auto max-w-[140px] object-contain", className)} />
  ) : (
    <span className={cn("text-sm font-semibold", className)}>{pack.name}</span>
  );
}

const SAMPLE = { scope1: 1840.2, scope2: 2210.7, scope3: 415.3 };

/** Overview: top bar + header + KPIs + scope bar + statuses, all real components. */
export function OverviewScreen({ pack, look }: { pack: ThemePack; look: Look }) {
  // Classic and Night have a dark top bar; Light has a white one.
  const darkChrome = look !== "light";
  return (
    <div>
      <div className="flex items-center gap-4 border-b border-chrome-line bg-chrome px-4 py-2.5 text-chrome-fg">
        <Wordmark pack={pack} onDark={darkChrome} />
        <nav aria-label="Preview navigation" className="hidden items-center gap-1 text-sm sm:flex">
          <span className="rounded-chip bg-chrome-active px-2 py-1">Overview</span>
          <span className="px-2 py-1 text-chrome-muted">Data</span>
          <span className="px-2 py-1 text-chrome-muted">Reports</span>
          <span className="px-2 py-1 text-chrome-muted">Team</span>
        </nav>
        <span className="ml-auto flex items-center gap-3 text-chrome-muted">
          <Search aria-hidden className="size-4" />
          <Bell aria-hidden className="size-4" />
        </span>
      </div>
      <div className="space-y-4 p-4">
        <PageHeader
          title="Overview"
          description="Sample figures for this preview"
          primaryAction={{ label: "Approve 3 entries", onClick: () => {} }}
          secondaryActions={[{ label: "Export", onClick: () => {} }]}
        />
        <KpiStrip
          items={[
            { label: "Net emissions", value: 4466.2, format: "emissions", previous: 4870.5, lowerIsBetter: true, primary: true },
            { label: "Scope 1", value: SAMPLE.scope1, format: "emissions" },
            { label: "Scope 2", value: SAMPLE.scope2, format: "emissions" },
            { label: "Submitted", value: 86, format: "percent" },
          ]}
        />
        <div className="rounded-card border border-line bg-panel p-4">
          <p className="mb-2 text-sm font-medium text-ink">Emissions by scope</p>
          <ScopeBar totals={SAMPLE} />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-panel p-4">
          <StatusPill status="approved" />
          <StatusPill status="pending" />
          <StatusPill status="rejected" />
          <StatusPill status="missing" />
          <Badge tone="brand">AI 92%</Badge>
          <span className="inline-flex items-center rounded-chip bg-accent px-2 py-0.5 text-xs font-medium text-on-accent">Accent fill</span>
          <a href="#preview" onClick={(e) => e.preventDefault()} className="text-sm font-medium text-brand-text underline">
            Brand link
          </a>
        </div>
        <Callout tone="brand" title="Electricity is 12% above last year">
          Most of the rise is at the Hidd plant.
        </Callout>
      </div>
    </div>
  );
}

/** Sign in: brand cover and form, as on the client's sign-in page. */
export function SignInScreen({ pack, tokens }: { pack: ThemePack; tokens: ThemeTokens }) {
  const coverInk = textOnGradient(tokens["cover-from"], tokens["cover-to"], tokens.ink);
  const coverIsDark = coverInk !== tokens.ink;
  return (
    <div className="flex flex-col md:min-h-[420px] md:flex-row">
      <div
        style={{ color: coverInk }}
        className="flex min-h-[120px] flex-col justify-between gap-4 bg-linear-to-br from-cover-from to-cover-to p-6 md:w-[55%]"
      >
        <Wordmark pack={pack} onDark={coverIsDark} className="h-8" />
        <p className="text-xl font-semibold">Sign in to {pack.name}</p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3 bg-panel p-6">
        <TextField label="Email" value="name@company.com" onChange={() => {}} readOnly />
        <TextField label="Password" type="password" value="password" onChange={() => {}} readOnly />
        <Button variant="primary" className="w-full">
          Sign in
        </Button>
        <PoweredBy className="mt-4" />
      </div>
    </div>
  );
}

/** Report cover: the PDF prints in the light look on the cover gradient. */
export function ReportCoverScreen({ pack, tokens, year }: { pack: ThemePack; tokens: ThemeTokens; year: number }) {
  const coverInk = textOnGradient(tokens["cover-from"], tokens["cover-to"], tokens.ink);
  return (
    <div className="flex justify-center p-6">
      <div
        style={{ color: coverInk }}
        className="flex aspect-[210/297] w-full max-w-[300px] flex-col justify-between bg-linear-to-br from-cover-from to-cover-to p-6 shadow-md"
      >
        <span className="inline-flex w-fit rounded-chip bg-panel px-2 py-1">
          <Wordmark pack={pack} onDark={false} className="text-ink" />
        </span>
        <div>
          <p className="text-2xl font-semibold leading-tight">{pack.name}</p>
          <p className="mt-1 text-sm opacity-90">GHG report · CY{year}</p>
        </div>
        <PoweredBy className="opacity-80" />
      </div>
    </div>
  );
}

/** Reminder email: brand header bar and a primary button. */
export function EmailScreen({ pack }: { pack: ThemePack }) {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-card border border-line bg-panel">
        <div className="flex items-center gap-2 bg-brand px-4 py-3 text-on-brand">
          <Mail aria-hidden className="size-4" />
          <span className="text-sm font-semibold">{pack.name}</span>
        </div>
        <div className="space-y-3 p-4 text-sm text-ink">
          <p className="font-medium">Your October data is due</p>
          <p className="text-muted">Electricity and diesel are still missing for the Hidd plant.</p>
          <Button variant="primary">Add data</Button>
          <p className="text-xs text-muted">You get this because you enter data for {pack.name} in ESGLite.</p>
        </div>
      </div>
    </div>
  );
}
