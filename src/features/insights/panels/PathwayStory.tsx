import { useEffect, useState } from "react";
import { useInsightsQuery } from "../../../lib/insights/query";
import { SegmentedControl } from "../../../ui";
import { RuleSentence } from "../components/RuleSentence";
import { useBridge } from "../hooks/useBridge";
import { shellState } from "../logic";
import { BridgePanel } from "./Bridge";
import { Pathway } from "./Pathway";
import type { PanelProps } from "./index";

export type StoryMode = "pathway" | "bridge";

/**
 * Story 3 (05-ux §3): Pathway (IN-4) ⇄ What moved (IN-5) in one slot. The
 * toggle in the chart header switches the same chart from the stacked scope
 * bars to the bridge waterfall, so ECharts morphs one into the other
 * (motion.morph; static under reduced motion). `?panel=bridge` opens on What
 * moved. The bridge loads only once it's asked for. Above the chart: the
 * `pathway_gap` / `pathway_on_track` card's sentence (IN-3).
 */
export function PathwayStory({ response, query }: PanelProps<"pathway">) {
  const { panel } = useInsightsQuery();
  const [mode, setMode] = useState<StoryMode>(panel === "bridge" ? "bridge" : "pathway");
  useEffect(() => {
    if (panel === "bridge") setMode("bridge");
  }, [panel]);
  const bridge = useBridge(query, { enabled: mode === "bridge" });
  const state = shellState(bridge);
  const ready = mode === "bridge" && state === "ok" ? bridge.data!.data! : null;

  const toggle = (
    <SegmentedControl<StoryMode>
      label="Pathway or what moved"
      size="sm"
      value={mode}
      onChange={setMode}
      options={[
        { value: "pathway", label: "Pathway" },
        { value: "bridge", label: "What moved" },
      ]}
    />
  );

  // The bridge's own empty or error state replaces the chart (nothing to morph to).
  if (mode === "bridge" && (state === "empty" || state === "error"))
    return (
      <div className="space-y-2" data-testid="pathway-story" data-mode="bridge">
        <div className="flex justify-end">{toggle}</div>
        <BridgePanel query={query} />
      </div>
    );

  return (
    <div data-testid="pathway-story" data-mode={ready ? "bridge" : "pathway"} aria-busy={mode === "bridge" && state === "loading"}>
      <Pathway response={response} query={query} actions={toggle} whatMoved={ready} sentence={<RuleSentence query={query} rules={["pathway_gap", "pathway_on_track"]} />} />
    </div>
  );
}
