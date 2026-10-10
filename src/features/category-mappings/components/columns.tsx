import type { Column } from "../../../ui";
import { ALL_SITES, type MappingRow } from "../logic";
import { GlobalName, type RowActions, RowMenu } from "./cells";

const MATCH_LABEL = { matched: "Matched", missing: "No factor", unknown: "" } as const;

export function mappingColumns(actions: RowActions): Column<MappingRow>[] {
  return [
    { id: "client", header: "Client", sortable: true, value: (r) => r.clientName },
    { id: "category", header: "Category", sortable: true, value: (r) => r.categoryName },
    {
      id: "name",
      header: "Client's name",
      hideable: false,
      sortable: true,
      value: (r) => r.company_category_name,
      cell: (r) => <span className="font-medium text-ink">{r.company_category_name}</span>,
    },
    {
      id: "global",
      header: "Global factor name",
      hideable: false,
      sortable: true,
      value: (r) => r.global_category_name,
      exportValue: (r) => r.global_category_name,
      cell: (r) => <GlobalName row={r} />,
    },
    {
      id: "match",
      header: "Factor",
      sortable: true,
      defaultHidden: true,
      value: (r) => MATCH_LABEL[r.match.state],
    },
    {
      id: "site",
      header: "Site",
      sortable: true,
      value: (r) => r.siteName,
      cell: (r) => <span className={r.siteName === ALL_SITES ? "text-muted" : undefined}>{r.siteName}</span>,
    },
    {
      id: "actions",
      header: "",
      hideable: false,
      width: "3.5rem",
      value: () => null,
      exportValue: () => null,
      cell: (r) => <RowMenu row={r} actions={actions} />,
    },
  ];
}
