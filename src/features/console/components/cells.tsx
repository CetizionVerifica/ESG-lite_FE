import { CHECK_LABELS, type ClientRow, setupPercent } from "../logic";

export function SetupBar({ row }: { row: ClientRow }) {
  const value = setupPercent(row);
  if (value === null) return <span className="text-muted">Checking…</span>;
  const missing = row.checks.filter((c) => c.ok === false).map((c) => CHECK_LABELS[c.id]);
  return (
    <span className="flex items-center gap-2" title={missing.length ? `Missing: ${missing.join(", ")}` : "Setup complete"}>
      <span
        role="meter"
        aria-label={`Setup ${value}% complete`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-line"
      >
        <span className={`block h-full rounded-full ${value === 100 ? "bg-good" : value >= 60 ? "bg-warn" : "bg-bad"}`} style={{ width: `${value}%` }} />
      </span>
      <span className="font-num text-sm text-ink">{value}%</span>
    </span>
  );
}

/** The client's saved primary and accent; colours come from the brand record. */
export function ThemeSwatch({ row }: { row: ClientRow }) {
  const b = row.brand;
  if (!b?.updatedAt) return <span className="text-muted">Default</span>;
  return (
    <span className="flex items-center gap-1" role="img" aria-label="Custom theme" title={`${b.primary} · ${b.accent}`}>
      <span className="size-4 rounded-chip border border-line" style={{ background: b.primary }} />
      <span className="size-4 rounded-chip border border-line" style={{ background: b.accent }} />
    </span>
  );
}
