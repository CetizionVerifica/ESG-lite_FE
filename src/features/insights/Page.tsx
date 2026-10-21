import { useCallback, useEffect, useState } from "react";
import { Download, Presentation } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useInsightsQuery } from "../../lib/insights/query";
import { isInsightsOff, useInsights } from "../../lib/insights/switch";
import { InsightsNotAvailable } from "../../lib/insights/InsightsGate";
import { PageHeader, Select, TabPanel, Tabs, cn } from "../../ui";
import { useInsightsSites } from "./api";
import { InsightsFilters } from "./components/InsightsFilters";
import { PanelShell } from "./components/PanelShell";
import { PendingBanner } from "./components/PendingBanner";
import { SLOTS, STORY_SLOTS, type TabSlot, slotForPanel, tabsFor } from "./logic";

/**
 * IN-0 · `/insights`: the page shell (05-ux §3). Header with filters, then the
 * named slots: stripes band, hero strip, four story panels, insight cards and
 * lazy tabs. Each slot is a PanelShell that loads its own endpoint and shows
 * its own states; modules fill the slots through `panels/index.ts`. Every
 * number on the page comes from an `/insights` endpoint.
 */
export default function InsightsPage() {
  const { role } = useAuth();
  const { query, panel, set } = useInsightsQuery();
  const { kpi_tracking: kpiOn } = useInsights();
  const sites = useInsightsSites();
  const [serverOff, setServerOff] = useState(false);
  const switchOff = useCallback(() => setServerOff(true), []);
  const tabs = tabsFor(kpiOn);
  const targetSlot = slotForPanel(panel);
  const [tab, setTab] = useState<TabSlot>(() => (targetSlot && (tabs as string[]).includes(targetSlot) ? (targetSlot as TabSlot) : tabs[0]));
  const activeTab: TabSlot = tabs.includes(tab) ? tab : tabs[0];
  const thisYear = new Date().getFullYear();

  // A `?panel=` naming a tab opens it.
  useEffect(() => {
    if (targetSlot && (tabs as string[]).includes(targetSlot)) setTab(targetSlot as TabSlot);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the target changes
  }, [targetSlot]);

  if (serverOff || (sites.error && isInsightsOff(sites.error))) {
    const staff = role === "Superadmin";
    return (
      <div className="space-y-6 py-6">
        <PageHeader title="Insights" />
        <InsightsNotAvailable staff={staff} home={staff ? "/clients" : role === "Manager" ? "/overview" : null} />
      </div>
    );
  }

  const shell = (id: keyof typeof SLOTS, extra?: { enabled?: boolean; className?: string }) => (
    <PanelShell key={id} slot={SLOTS[id]} query={query} target={targetSlot === id} onSwitchOff={switchOff} enabled={extra?.enabled} className={extra?.className} />
  );

  return (
    <div className="space-y-5 py-6" data-testid="insights-page">
      <PageHeader
        title="Insights"
        description="How you're doing and why: emissions, targets and ESG data in one story, from approved data."
        context={<InsightsFilters query={query} sites={sites.data?.sites} pillars={kpiOn} onChange={set} thisYear={thisYear} />}
        secondaryActions={[
          { label: "Present", icon: <Presentation className="size-4" aria-hidden />, onClick: () => undefined, disabled: true }, // IN-8
          { label: "Export", icon: <Download className="size-4" aria-hidden />, onClick: () => undefined, disabled: true }, // IN-8
        ]}
      />

      <PendingBanner query={query} />

      {shell("stripes")}
      {shell("hero")}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12" data-testid="insights-stories">
        {STORY_SLOTS.map((id) => shell(id, { className: cn("md:col-span-1", SLOTS[id].span) }))}
      </div>

      {shell("cards")}

      <section aria-label="More detail" className="space-y-3" data-testid="insights-tabs">
        <div className="hidden sm:block">
          <Tabs<TabSlot> label="More detail" idBase="insights-tab" value={activeTab} onChange={setTab} items={tabs.map((t) => ({ value: t, label: SLOTS[t].title }))} />
        </div>
        <div className="sm:hidden">
          <Select<TabSlot> label="More detail" hideLabel value={activeTab} onChange={(v) => v && setTab(v)} options={tabs.map((t) => ({ value: t, label: SLOTS[t].title }))} />
        </div>
        {tabs.map((t) => (
          <TabPanel key={t} idBase="insights-tab" value={t} current={activeTab}>
            {t === activeTab && shell(t)}
          </TabPanel>
        ))}
      </section>
    </div>
  );
}
