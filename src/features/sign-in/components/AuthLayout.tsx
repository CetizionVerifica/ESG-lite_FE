import { type CSSProperties, type ReactNode, useMemo } from "react";
import { PoweredBy, cn } from "../../../ui";
import { type ThemePack, buildTheme, textOnGradient, toCssVars, useTheme } from "../../../theme";
import { coverTitle } from "../logic";

export interface AuthLayoutProps {
  /** Theme for this screen: the client's brand, or PlanetPulse. */
  pack: ThemePack;
  /** Client name for the cover; null on PlanetPulse screens. */
  clientName: string | null;
  /** Replaces the cover heading (staff sign-in). */
  coverHeading?: string;
  children: ReactNode;
}

/**
 * Shared frame of the signed-out screens: brand cover (55%) and form panel
 * (45%); on narrow screens the cover is a 120px band above the form. The
 * pack's tokens are applied to this subtree, so a client theme shows before
 * anyone is signed in without touching the app-wide theme.
 */
export function AuthLayout({ pack, clientName, coverHeading, children }: AuthLayoutProps) {
  const { resolvedAppearance } = useTheme();
  const tokens = useMemo(() => buildTheme(pack, pack.defaultLook, resolvedAppearance), [pack, resolvedAppearance]);
  const coverInk = textOnGradient(tokens["cover-from"], tokens["cover-to"], tokens.ink);
  const coverIsDark = coverInk !== tokens.ink;
  const logo = coverIsDark ? pack.logoOnDarkUrl : pack.logoUrl;
  const style = { ...toCssVars(tokens), colorScheme: resolvedAppearance } as CSSProperties;

  return (
    <div style={style} data-pack={pack.id} className="flex min-h-screen flex-col bg-page text-ink lg:flex-row">
      <section
        aria-label={clientName ?? "ESGLite"}
        style={{ color: coverInk }}
        className="relative flex h-[120px] shrink-0 flex-col justify-center overflow-hidden bg-linear-to-br from-cover-from to-cover-to px-6 lg:h-auto lg:w-[55%] lg:justify-between lg:px-14 lg:py-12"
      >
        <LineArt />
        <div className="relative flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={clientName ?? pack.name} className="h-8 w-auto max-w-[200px] object-contain lg:h-10" />
          ) : (
            <span className="font-brand text-lg font-semibold lg:text-2xl">{clientName ?? "ESGLite"}</span>
          )}
        </div>
        <div className="relative mt-2 lg:mt-0 lg:max-w-md">
          <h1 className="font-brand text-sm font-medium opacity-90 lg:text-4xl lg:leading-tight lg:font-semibold lg:opacity-100">
            {coverHeading ?? coverTitle(clientName)}
          </h1>
          <p className="mt-3 hidden text-base opacity-80 lg:block">
            Record monthly activity data, get it approved and report your emissions in tCO₂e.
          </p>
        </div>
        <span aria-hidden className="hidden lg:block" />
      </section>

      <main className="flex flex-1 flex-col items-center bg-panel px-6 py-8 lg:w-[45%] lg:justify-center lg:px-12 lg:py-10">
        <div className="w-full max-w-sm">{children}</div>
        <PoweredBy className="mt-10" />
      </main>
    </div>
  );
}

/** Contour lines in the cover's text colour, kept faint. */
function LineArt({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      preserveAspectRatio="xMaxYMax slice"
      className={cn("pointer-events-none absolute inset-0 size-full opacity-15", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M ${-40 + i * 10} ${400 - i * 6} C ${120 + i * 14} ${300 - i * 22}, ${220 + i * 8} ${360 - i * 30}, ${440} ${180 - i * 20}`} />
      ))}
    </svg>
  );
}
