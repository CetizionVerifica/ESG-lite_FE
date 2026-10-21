import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "../../../ui";
import { useInsightsEvents } from "../api";
import { EventsDrawer } from "../components/EventsDrawer";
import { RuleSentence } from "../components/RuleSentence";
import { Decoupling } from "./Decoupling";
import type { PanelProps } from "./index";

/**
 * Story 1 (05-ux §4 B) as the page shows it: IN-2's Decoupling with IN-3's
 * `decoupling` sentence above the chart and IN-4's events marked on it (and
 * an "Events" button to manage them).
 */
export function DecouplingStory({ response, query }: PanelProps<"decoupling">) {
  const years = response.data.years;
  const range = years.length ? { from: `${years[0]}-01-01`, to: `${years[years.length - 1] + 1}-12-31` } : {};
  const events = useInsightsEvents(range);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <RuleSentence query={query} rules={["decoupling"]} />
        <Button size="sm" variant="secondary" className="ml-auto" icon={<CalendarDays aria-hidden className="size-4" />} onClick={() => setOpen(true)} data-testid="decoupling-events-button">
          Events
        </Button>
      </div>
      <Decoupling response={response} query={query} events={events.data} />
      <EventsDrawer open={open} onClose={() => setOpen(false)} range={range} />
    </div>
  );
}
