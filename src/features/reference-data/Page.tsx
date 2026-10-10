import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "../../ui";
import { CategoriesTab } from "./components/CategoriesTab";
import { CountriesTab } from "./components/CountriesTab";
import { UnitsTab } from "./components/UnitsTab";
import { TABS, TAB_LABEL, type RefTab, readTab } from "./logic";

/** P21 `/setup/reference?tab=countries|categories|units`: the lists every site and entry form draws on. */
export default function ReferenceDataPage() {
  const [params, setParams] = useSearchParams();
  const tab = readTab(params.get("tab"));
  const idBase = useId();

  // Each tab has its own filters and drawer, so switching starts clean.
  const setTab = (next: RefTab) => setParams(new URLSearchParams({ tab: next }));
  const shell = {
    nav: <Tabs label="Reference data lists" idBase={idBase} items={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))} value={tab} onChange={setTab} />,
    panel: { id: `${idBase}-panel-${tab}`, labelledBy: `${idBase}-tab-${tab}` },
  };

  if (tab === "categories") return <CategoriesTab key={tab} {...shell} />;
  if (tab === "units") return <UnitsTab key={tab} {...shell} />;
  return <CountriesTab key={tab} {...shell} />;
}
