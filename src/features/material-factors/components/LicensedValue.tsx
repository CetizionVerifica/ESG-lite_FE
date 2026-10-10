import { Lock } from "lucide-react";

/** Stands in for a licensed (ecoinvent) value the viewer may not see; the source stays visible. */
export function LicensedValue() {
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      <Lock aria-hidden className="size-3.5" />
      <span>Licensed</span>
    </span>
  );
}
