import { useMemo } from "react";
import { SegmentedControl } from "../../../ui";
import type { Look, ThemePack } from "../../../theme";
import { LOOKS, LOOK_LABELS, SCREENS, type Screen, contrastGate, lookTokens } from "../logic";
import { ContrastReport } from "./ContrastReport";
import { EmailScreen, OverviewScreen, ReportCoverScreen, SignInScreen, ThemeScope } from "./screens";

export interface PreviewPaneProps {
  pack: ThemePack;
  look: Look;
  onLook: (look: Look) => void;
  screen: Screen;
  onScreen: (screen: Screen) => void;
  reportYear: number;
}

/** Live preview: the real app components in the draft theme, plus the contrast gate. */
export function PreviewPane({ pack, look, onLook, screen, onScreen, reportYear }: PreviewPaneProps) {
  // Reports always print in the light look (pdfTheme), whatever is picked.
  const shownLook: Look = screen === "report" ? "light" : look;
  const tokens = useMemo(() => lookTokens(pack, shownLook), [pack, shownLook]);
  const gate = useMemo(() => contrastGate(pack, look), [pack, look]);
  const lookTokensForReport = useMemo(() => lookTokens(pack, look), [pack, look]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl<Look>
          label="Preview look"
          size="sm"
          options={LOOKS.map((l) => ({ value: l, label: LOOK_LABELS[l] }))}
          value={look}
          onChange={onLook}
        />
        <SegmentedControl<Screen> label="Preview screen" size="sm" options={SCREENS} value={screen} onChange={onScreen} />
      </div>
      {screen === "report" && <p className="text-xs text-muted">Reports always print in the light look.</p>}
      <ThemeScope tokens={tokens} dark={shownLook === "night"} className="overflow-hidden rounded-card border border-line">
        <div aria-label={`Preview: ${SCREENS.find((s) => s.value === screen)?.label}, ${LOOK_LABELS[shownLook]}`} role="region" inert>
          {screen === "overview" && <OverviewScreen pack={pack} look={shownLook} />}
          {screen === "sign-in" && <SignInScreen pack={pack} tokens={tokens} />}
          {screen === "report" && <ReportCoverScreen pack={pack} tokens={tokens} year={reportYear} />}
          {screen === "email" && <EmailScreen pack={pack} />}
        </div>
      </ThemeScope>
      <ContrastReport gate={gate} tokens={lookTokensForReport} look={look} />
    </div>
  );
}
