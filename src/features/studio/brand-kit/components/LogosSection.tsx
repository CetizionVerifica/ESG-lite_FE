import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";
import type { BrandKit } from "../../../../lib/studio/contracts";

function LogoTile({ url, label, dark }: { url: string | null; label: string; dark?: boolean }) {
  return (
    <figure className="space-y-1.5">
      <div
        className="flex h-24 items-center justify-center rounded-card border border-line p-3"
        // The tile shows the logo on the surface it was made for: brand data, not an app colour.
        style={dark ? { background: "#16202e" } : { background: "#ffffff" }}
      >
        {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : <ImageOff aria-label={`No ${label.toLowerCase()} yet`} className="size-6 text-muted" />}
      </div>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

/** Logos from the client's brand (read-only here; Superadmins edit them in Brand themes). */
export function LogosSection({ kit, superadminClientId }: { kit: BrandKit; superadminClientId: number | null }) {
  return (
    <section aria-labelledby="bk-logos" className="space-y-3 rounded-card border border-line bg-panel p-4">
      <h2 id="bk-logos" className="text-sm font-semibold text-ink">
        Logos
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <LogoTile url={kit.logos.primary} label="Logo on light" />
        <LogoTile url={kit.logos.onDark} label="Logo on dark" dark />
      </div>
      {superadminClientId ? (
        <Link to={`/clients/${superadminClientId}/brand`} className="text-sm text-brand-text underline-offset-2 hover:underline">
          Change logos in Brand themes
        </Link>
      ) : (
        <p className="text-sm text-muted" data-testid="logo-support">
          Ask ESGLite support to change logos.
        </p>
      )}
    </section>
  );
}
