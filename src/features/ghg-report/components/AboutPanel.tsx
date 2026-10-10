import { useState } from "react";
import { Callout } from "../../../ui";

const KEY = "esglite.ghgReport.aboutDismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** "About GHG reporting": what the old intro step said, now one dismissible note. */
export function AboutPanel() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Storage blocked: hidden for this visit only.
    }
  };
  return (
    <Callout tone="brand" title="About GHG reporting" onDismiss={dismiss}>
      Emissions are grouped by the GHG Protocol: Scope 1 is direct (fuel burned on site), Scope 2 is purchased energy, Scope 3 is everything else in the value
      chain. Each figure is compared with the same period a year earlier. Renewables aren&apos;t a scope, so they&apos;re shown as saved and kept out of the
      totals.
    </Callout>
  );
}
