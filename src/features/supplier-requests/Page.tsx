import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mail, Plus } from "lucide-react";
import { Button, Callout, DataTable, EmptyState, FilterBar, PageHeader, cn, focusRing, useFilterParams, useToast } from "../../ui";
import type { SendResponse } from "../../services/supplierRequestService";
import { useRequest, useRequests } from "./api";
import { AskSupplierModal } from "./components/AskSupplierModal";
import { RequestDrawer } from "./components/RequestDrawer";
import { requestColumns } from "./components/columns";
import { STATUSES, STATUS_LABEL, type SupplierRequest, type SupplierRequestStatus, askParams, errorMessage } from "./logic";

const FILTERS = [{ key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })), multiple: false }];

const aiConfigured = () => !!import.meta.env.VITE_OCR_API_URL;

/** C06 · /products/suppliers: who was asked for a supplier footprint, who answered, and the review of what came in. */
export default function SupplierRequestsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(["status"]);
  const status = (filters.filters.status?.[0] ?? undefined) as SupplierRequestStatus | undefined;
  const studyParam = Number(params.get("study"));
  const study = Number.isInteger(studyParam) && studyParam > 0 ? studyParam : undefined;
  const ask = askParams(params);
  const openId = Number(params.get("request"));
  const selectedId = Number.isInteger(openId) && openId > 0 ? openId : null;

  const list = useRequests({ study, status });
  const selected = useRequest(selectedId);
  const [links, setLinks] = useState<Record<number, { link: string; note: string | null }>>({});

  const columns = useMemo(() => requestColumns(), []);
  const rows = list.data?.requests ?? [];
  const current: SupplierRequest | null = selected.data?.request ?? rows.find((r) => r.supplier_request_id === selectedId) ?? null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key); // data-loss-reviewed: URL param, not data
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  const openAsk = () => setParam("new", "1");
  const closeAsk = () => {
    setParams(
      (p) => {
        p.delete("new"); // data-loss-reviewed: URL param, not data
        p.delete("input"); // data-loss-reviewed: URL param, not data
        return p;
      },
      { replace: true },
    );
  };

  const onSent = (sent: SendResponse) => {
    setLinks((l) => ({ ...l, [sent.request.supplier_request_id]: { link: sent.link, note: sent.mail.delivered ? null : sent.mail.reason } }));
    toast({ title: sent.mail.delivered ? "Request sent" : "Request recorded", description: sent.mail.delivered ? `Sent to ${sent.request.supplier_email}.` : "Copy the link to the supplier.", tone: "good" });
    setParams(
      (p) => {
        p.delete("new"); // data-loss-reviewed: URL param, not data
        p.delete("input"); // data-loss-reviewed: URL param, not data
        p.set("request", String(sent.request.supplier_request_id));
        return p;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (selectedId !== null && selected.isError) toast({ title: errorMessage(selected.error, "That request couldn't be opened."), tone: "bad" });
  }, [selectedId, selected.isError, selected.error, toast]);

  const empty = (
    <EmptyState
      icon={Mail}
      title={status ? `No ${STATUS_LABEL[status].toLowerCase()} requests.` : "No supplier requests yet."}
      description="Ask a supplier for the footprint of a material to replace a database factor with their own figure."
      action={
        <Button icon={<Plus aria-hidden className="size-4" />} onClick={openAsk}>
          Ask supplier
        </Button>
      }
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier requests"
        description={
          <>
            Supplier footprints replace database factors and raise the primary data share.{" "}
            <Link to="/products" className={cn("text-brand-text underline underline-offset-2", focusRing)}>
              Back to product footprints
            </Link>
          </>
        }
        primaryAction={{ label: "Ask supplier", onClick: openAsk, icon: <Plus aria-hidden className="size-4" /> }}
      />
      {list.data?.mail_mode === "sink" && rows.length > 0 && (
        <Callout tone="info">Email sending is off on this server: new requests are recorded and you copy the link to the supplier yourself.</Callout>
      )}
      <DataTable<SupplierRequest>
        label="Supplier requests"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.supplier_request_id}
        rowLabel={(r) => `${r.material} from ${r.supplier_name ?? r.supplier_email}`}
        loading={list.isLoading}
        error={list.isError ? errorMessage(list.error, "Supplier requests couldn't be loaded.") : null}
        onRetry={() => list.refetch()}
        empty={empty}
        defaultSort={{ id: "requested", dir: "desc" }}
        onRowClick={(r) => setParam("request", String(r.supplier_request_id))}
        highlightId={selectedId ?? undefined}
        toolbar={<FilterBar filters={FILTERS} value={filters} onChange={setFilters} search={false} />}
        exportName="supplier-requests"
        storageKey="supplier-requests"
        pagination={{ mode: "client", pageSize: 25 }}
      />
      <AskSupplierModal open={ask.open} onClose={closeAsk} studyId={ask.study_id ?? study ?? null} inputId={ask.input_id} onSent={onSent} />
      {current && (
        <RequestDrawer
          request={current}
          link={links[current.supplier_request_id]?.link ?? null}
          mailNote={links[current.supplier_request_id]?.note ?? null}
          aiAvailable={aiConfigured()}
          onClose={() => setParam("request", null)}
          onLink={(link, note) => setLinks((l) => ({ ...l, [current.supplier_request_id]: { link, note } }))}
        />
      )}
    </div>
  );
}
