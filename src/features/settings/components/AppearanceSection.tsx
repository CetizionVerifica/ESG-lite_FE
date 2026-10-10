import { useRef } from "react";
import { SegmentedControl, useToast } from "../../../ui";
import { type Appearance, useTheme } from "../../../theme";
import { clientThemeLabel } from "../logic";
import { ReadOnlyRow, Section } from "./Section";

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Light / Dark / System, applied at once and saved to the account. The client's look is shown, not chosen. */
export function AppearanceSection() {
  const { appearance, setAppearance, pack } = useTheme();
  const { toast, dismiss } = useToast();
  const last = useRef<number | null>(null);
  // Arrow keys move through the options one save at a time; only the latest answer is shown.
  const seq = useRef(0);

  const choose = (next: Appearance) => {
    const mine = ++seq.current;
    void setAppearance(next).then((saved) => {
      if (mine !== seq.current) return;
      if (last.current !== null) dismiss(last.current);
      last.current = saved
        ? toast({ title: "Appearance saved", tone: "good" })
        : toast({ title: "Appearance not saved to your account", description: "It applies on this device only. Try again later.", tone: "bad" });
    });
  };

  return (
    <Section id="appearance" title="Appearance" description="Saved to your account, so it follows you to other devices.">
      <SegmentedControl label="Colour scheme" options={OPTIONS} value={appearance} onChange={choose} />
      <dl>
        <ReadOnlyRow label="Theme">{clientThemeLabel(pack.name, pack.defaultLook)}</ReadOnlyRow>
      </dl>
      <p className="text-xs text-muted">Your organisation sets its theme for everyone.</p>
    </Section>
  );
}
