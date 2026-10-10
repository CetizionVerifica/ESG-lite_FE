import { useState } from "react";
import { ChevronDown, FileSpreadsheet } from "lucide-react";
import { exportMonthlyEmissions, exportYearEmissions } from "../../../services/emissionService";
import { Button, Menu, type MenuEntry, type Period, useToast } from "../../../ui";
import { useFyStartMonth } from "../../../lib/fiscalYear";
import { errorMessage } from "../api";
import { type ReportOption, reportOptions } from "../logic";

/** Header "Excel report ▾": the server's formatted month or year file for the chosen sites. */
export function ReportMenu({ siteIds, categoryId, period }: { siteIds: number[]; categoryId: number | null; period: Period | null }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const options = reportOptions(period, useFyStartMonth());

  const run = async (o: ReportOption) => {
    setBusy(true);
    try {
      const base = { siteIds, categoryId: categoryId ?? undefined };
      if (o.kind === "month") {
        await exportMonthlyEmissions({ ...base, year: o.year, month: o.month });
      } else {
        const { truncated } = await exportYearEmissions({ ...base, year: o.year, yearType: o.yearType });
        if (truncated) toast({ title: "The file was cut at the server's row limit", description: "Pick fewer sites or one category to get everything." });
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast({
        title: status === 404 ? `No entries for ${o.label.replace(" (month)", "")}` : "Couldn't download the report",
        description: status === 404 ? undefined : errorMessage(e, "Try again in a moment."),
        tone: status === 404 ? "neutral" : "bad",
      });
    } finally {
      setBusy(false);
    }
  };

  const items: MenuEntry[] =
    options.length > 0
      ? options.map((o) => ({ label: o.label, onSelect: () => void run(o) }))
      : [{ label: "Pick a month or year first", disabled: true, onSelect: () => undefined }];

  return (
    <Menu
      label="Excel report"
      items={items}
      trigger={(t) => (
        <Button {...t} size="sm" loading={busy} disabled={siteIds.length === 0} icon={<FileSpreadsheet aria-hidden className="size-4" />}>
          Excel report <ChevronDown aria-hidden className="size-3.5" />
        </Button>
      )}
    />
  );
}
