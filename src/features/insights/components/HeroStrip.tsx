import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { PILLARS, type Pillar, type Summary } from "../../../lib/insights/contracts";
import { ATTENTION_LABEL, changeText, pctNumber, unitText } from "../../../lib/insights/labels";
import { PILLAR_LABEL, PILLAR_LETTER } from "../../../lib/kpi/labels";
import { Menu, cn, emissionsParts, focusRing, formatNumber, formatPercent } from "../../../ui";
import type { PanelProps } from "../panels";
import { useCountUp } from "../hooks/useCountUp";
import { compareLabel, intensityDecimals, intensityUnit, pathwayHint, readinessSentence } from "./heroLogic";
import { ChangeChip, PillarLetter, StatusChip } from "./kit";

/**
 * IN-1 · The hero strip (05-ux §4): four cells answering "are we on track?"
 * — net tCO₂e with its change and pathway pill, intensity, ESG readiness (a
 * mini E/S/G tri-ring; renewable share without KPI tracking) and "Needs you"
 * with a menu of what's waiting. Every figure is the server's; each cell is a
 * door to the page behind it (`links`). 1280: one row; 1024: 2 × 2; 390: stacked.
 */
export function HeroStrip({ response, query, size = "page" }: PanelProps<"summary"> & { size?: "page" | "present" }) {
  const s = response.data;
  const links = response.links;
  const vs = compareLabel(query);
  const big = size === "present";
  return (
    <dl className={cn("grid grid-cols-1 gap-px overflow-hidden rounded-card bg-line md:grid-cols-2 lg:grid-cols-4", big && "lg:grid-cols-2")} data-testid="hero-strip">
      <NetCell s={s} vs={vs} link={links.net} big={big} />
      <IntensityCell s={s} vs={vs} link={links.intensity} big={big} />
      {s.readiness ? <ReadinessCell readiness={s.readiness} link={links.readiness} big={big} /> : <RenewableCell pct={s.renewable_share_pct ?? null} link={links.renewables ?? links.intensity} big={big} />}
      <AttentionCell attention={s.attention} link={links.attention} big={big} />
    </dl>
  );
}

function Cell({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 bg-panel p-4 sm:p-5" data-testid={testId}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      {children}
    </div>
  );
}

/** A figure that opens the page behind it when the server gave a link. */
function Door({ to, label, children }: { to?: string; label: string; children: ReactNode }) {
  if (!to) return <>{children}</>;
  return (
    <Link to={to} aria-label={label} className={cn("inline-flex items-baseline rounded-control hover:underline", focusRing)}>
      {children}
    </Link>
  );
}

const figure = (big: boolean) => cn("font-num font-semibold tabular-nums text-ink", big ? "text-[56px] leading-none" : "text-3xl");

function NetCell({ s, vs, link, big }: { s: Summary; vs: string; link?: string; big: boolean }) {
  const shown = useCountUp(s.net.value);
  const final = emissionsParts(s.net.value);
  const parts = emissionsParts(shown);
  const change = changeText(s.net.change_pct, s.net.good, vs);
  return (
    <Cell label="Net emissions" testId="hero-net">
      <dd className="mt-1">
        <Door to={link} label={`Net emissions ${final.value} ${final.unit}: open the approved entries`}>
          <span className={figure(big)} data-testid="hero-net-value" aria-hidden>
            {parts.value}
          </span>
          <span className="sr-only">{final.value}</span>
          <span className="ml-1 text-xs text-muted">{final.unit}</span>
        </Door>
      </dd>
      <dd className="mt-2 flex flex-wrap items-center gap-1.5">
        {change && <ChangeChip change={change} />}
        <StatusChip status={s.pathway?.status ?? null} />
      </dd>
      {s.pathway && pathwayHint(s.pathway) && <dd className="mt-1 text-xs text-muted">{pathwayHint(s.pathway)}</dd>}
    </Cell>
  );
}

function IntensityCell({ s, vs, link, big }: { s: Summary; vs: string; link?: string; big: boolean }) {
  const i = s.intensity;
  const shown = useCountUp(i.value);
  const decimals = intensityDecimals(i.value);
  const change = changeText(i.change_pct, i.good, vs);
  const unit = intensityUnit(i.unit);
  return (
    <Cell label={`Intensity per ${unitText(i.unit)}`} testId="hero-intensity">
      <dd className="mt-1">
        <Door to={link} label={`Intensity ${formatNumber(i.value, decimals)} ${unit}: open production data`}>
          <span className={figure(big)} aria-hidden data-testid="hero-intensity-value">
            {formatNumber(shown, decimals)}
          </span>
          <span className="sr-only">{formatNumber(i.value, decimals)}</span>
          {i.value !== null && <span className="ml-1 text-xs text-muted">{unit}</span>}
        </Door>
      </dd>
      <dd className="mt-2 flex flex-wrap items-center gap-1.5">
        {change && <ChangeChip change={change} />}
        {i.value === null && <span className="text-xs text-muted">Add production data to see intensity.</span>}
      </dd>
      {i.combined && <dd className="mt-1 text-xs text-muted">Combined index: your sites report output in different units.</dd>}
    </Cell>
  );
}

const RING_R = [26, 19, 12] as const;

/** Three small arcs, E outside to G inside, each with its letter: colour is never the only signal. */
export function TriRing({ byPillar, size = 72 }: { byPillar: Record<Pillar, number>; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0 -rotate-90">
      {PILLARS.map((p, idx) => {
        const r = RING_R[idx];
        const c = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(100, byPillar[p] ?? 0));
        return (
          <g key={p}>
            <circle cx="32" cy="32" r={r} fill="none" className="stroke-tint" strokeWidth="5" />
            <circle cx="32" cy="32" r={r} fill="none" className={cn(p === "environment" ? "stroke-pillar-e" : p === "social" ? "stroke-pillar-s" : "stroke-pillar-g")} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
          </g>
        );
      })}
    </svg>
  );
}

function ReadinessCell({ readiness, link, big }: { readiness: NonNullable<Summary["readiness"]>; link?: string; big: boolean }) {
  const shown = useCountUp(readiness.pct);
  return (
    <Cell label="ESG readiness" testId="hero-readiness">
      <dd className="mt-1 flex items-center gap-3">
        <TriRing byPillar={readiness.by_pillar} size={big ? 112 : 64} />
        <div className="min-w-0">
          <Door to={link} label={`${readinessSentence(readiness)} Open the ESG dashboard`}>
            <span className={figure(big)} aria-hidden data-testid="hero-readiness-value">
              {formatPercent(shown, 0)}
            </span>
            <span className="sr-only">{readinessSentence(readiness)}</span>
          </Door>
          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="By pillar">
            {PILLARS.map((p) => (
              <li key={p} className="inline-flex items-center gap-1 text-xs text-muted">
                <PillarLetter pillar={p} />
                <span className="font-num tabular-nums text-ink">{formatPercent(readiness.by_pillar[p], 0)}</span>
                <span className="sr-only">{PILLAR_LABEL[p]} ({PILLAR_LETTER[p]})</span>
              </li>
            ))}
          </ul>
        </div>
      </dd>
      <dd className="mt-1 text-xs text-muted">of KPI values approved</dd>
    </Cell>
  );
}

function RenewableCell({ pct, link, big }: { pct: number | null; link?: string; big: boolean }) {
  const shown = useCountUp(pct);
  return (
    <Cell label="Renewable share" testId="hero-renewables">
      <dd className="mt-1">
        <Door to={pct === null ? undefined : link} label={`Renewable electricity ${formatPercent(pct, 0)}: open the data`}>
          <span className={figure(big)} aria-hidden>
            {formatPercent(shown, pct !== null && pct < 10 ? 1 : 0)}
          </span>
          <span className="sr-only">{pct === null ? "No data" : `${pctNumber(pct)}% renewable electricity`}</span>
        </Door>
      </dd>
      <dd className="mt-2 text-xs text-muted">{pct === null ? "Add Scope 2 electricity with its renewable share to see this." : "of electricity from renewable sources"}</dd>
    </Cell>
  );
}

function AttentionCell({ attention, link, big }: { attention: Summary["attention"]; link?: string; big: boolean }) {
  const navigate = useNavigate();
  const items = attention.items.filter((i) => i.count > 0);
  return (
    <Cell label="Needs you" testId="hero-attention">
      <dd className="mt-1">
        {attention.total === 0 || items.length === 0 ? (
          <>
            <span className={figure(big)}>0</span>
            <p className="mt-2 text-xs text-muted">Nothing waiting for you.</p>
          </>
        ) : (
          <Menu
            label="Needs you"
            align="start"
            items={items.map((i) => ({ label: `${ATTENTION_LABEL[i.kind]} · ${formatNumber(i.count)}`, onSelect: () => navigate(i.link) }))}
            trigger={(props) => (
              <button {...props} type="button" className={cn("inline-flex items-baseline gap-2 rounded-control text-left hover:underline", focusRing)} aria-label={`${formatNumber(attention.total)} items need you: show them`} data-testid="hero-attention-trigger">
                <span className={figure(big)}>{formatNumber(attention.total)}</span>
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-text">
                  {items.length === 1 ? ATTENTION_LABEL[items[0].kind] : `${items.length} kinds`}
                  <ChevronDown aria-hidden className="size-3.5" />
                </span>
              </button>
            )}
          />
        )}
      </dd>
      {items.length > 0 && link && (
        <dd className="mt-2 text-xs">
          <Link to={link} className={cn("rounded-control text-muted hover:text-ink hover:underline", focusRing)}>
            Open approvals
          </Link>
        </dd>
      )}
    </Cell>
  );
}
