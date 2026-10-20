// DS-7 · the data picker's list (pure): single values of the doc's kind.
import type { DataGroup, DataItem, DataToken } from "../../../../lib/studio/contracts";
import { filterGroups } from "../../panels/data/logic";

export interface PickerItem {
  item: DataItem;
  group: string;
}

/** Single-value items of the catalog that match the query, in catalog order. */
export function pickerItems(groups: DataGroup[], query: string): PickerItem[] {
  return filterGroups(groups, query).flatMap((g) =>
    g.items.filter((i) => !(i.binding.source === "ghg" && i.binding.breakdown) && !(i.binding.source === "kpi" && i.binding.breakdown)).map((item) => ({ item, group: g.label })),
  );
}

/** The chip a picked item becomes (value measure; the server's default format). */
export const chipFor = (item: DataItem): DataToken["attrs"] => ({ binding: item.binding, measure: "value" });
