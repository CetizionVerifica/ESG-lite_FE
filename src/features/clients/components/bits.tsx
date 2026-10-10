import { Building2 } from "lucide-react";
import type { Brand } from "../../../services/brandService";
import { Badge } from "../../../ui";

export function ClientLogo({ name, url, size = "sm" }: { name: string; url: string | null | undefined; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-12" : "size-8";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-panel`}>
      {url ? <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain" /> : <Building2 aria-hidden className="size-4 text-muted" />}
    </span>
  );
}

/** Primary + accent chips, coloured from the client's saved brand. */
export function ThemeSwatch({ brand }: { brand: Brand | undefined }) {
  if (!brand) return <span className="text-xs text-muted">PlanetPulse</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Brand colours ${brand.primary} and ${brand.accent}`} role="img">
      <span className="size-4 rounded-full border border-line" style={{ background: brand.primary }} />
      <span className="size-4 rounded-full border border-line" style={{ background: brand.accent }} />
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "good" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}
