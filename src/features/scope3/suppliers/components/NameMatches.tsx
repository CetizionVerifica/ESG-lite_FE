import type { UseQueryResult } from "@tanstack/react-query";
import type { NameMatch, NameMatchDecision } from "../../../../services/scope3SuppliersService";
import { Button, Callout, EmptyState, SkeletonText, cn, panel } from "../../../../ui";
import { errorMessage, useDecideMatch } from "../api";

type Props = {
  companyId: number | null;
  query: UseQueryResult<{ company_id: number; matches: NameMatch[] }>;
  editable: boolean;
  onDone: (text: string) => void;
};

const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

const keyOf = (m: NameMatch) => (m.type === "similar_suppliers" ? `pair-${m.a.supplier_id}-${m.b.supplier_id}` : `name-${m.name}`);

/**
 * The name-match review list: spellings that look like one supplier, and
 * entries naming a supplier that no row is linked to. Nothing is merged until
 * someone presses Link; Not the same is remembered.
 */
export function NameMatches({ companyId, query, editable, onDone }: Props) {
  const decide = useDecideMatch(companyId);

  if (query.isLoading) return <SkeletonText lines={3} />;
  if (query.isError)
    return (
      <EmptyState
        variant="error"
        title="Couldn't load the name matches."
        description={errorMessage(query.error, "Try again in a moment.")}
        action={<Button onClick={() => query.refetch()}>Retry</Button>}
      />
    );
  const matches = query.data?.matches ?? [];
  if (!matches.length) return <EmptyState title="No names to check." description="Spellings that look like the same supplier show up here." />;

  const send = (body: NameMatchDecision, text: string) => decide.mutate(body, { onSuccess: () => onDone(text) });

  return (
    <div className="space-y-3">
      {!editable && <Callout tone="info">A Manager, Admin or Superadmin decides these.</Callout>}
      {decide.isError && (
        <p role="alert" className="text-sm text-bad">
          {errorMessage(decide.error, "That didn't save. Try again.")}
        </p>
      )}
      <ul className="space-y-3" aria-label="Name matches">
        {matches.map((m) => (
          <li key={keyOf(m)} className={cn(panel, "flex flex-wrap items-center justify-between gap-3 p-4")}>
            {m.type === "similar_suppliers" ? (
              <>
                <div className="min-w-0 text-sm">
                  <p className="text-ink">
                    <span className="font-medium">{m.a.name}</span> ({rowsText(m.a.rows)}) and <span className="font-medium">{m.b.name}</span> ({rowsText(m.b.rows)})
                  </p>
                  <p className="text-xs text-muted">Link keeps {m.a.name} and moves the other's rows and figures to it.</p>
                </div>
                {editable && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => send({ type: "similar_suppliers", keep_id: m.a.supplier_id, other_id: m.b.supplier_id, decision: "link" }, `${m.b.name} linked to ${m.a.name}`)}
                      loading={decide.isPending}
                    >
                      Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => send({ type: "similar_suppliers", keep_id: m.a.supplier_id, other_id: m.b.supplier_id, decision: "not_same" }, "Kept as two suppliers")}
                      disabled={decide.isPending}
                    >
                      Not the same
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="min-w-0 text-sm">
                  <p className="text-ink">
                    “<span className="font-medium">{m.name}</span>” on {rowsText(m.rows)} with no supplier linked
                  </p>
                  <p className="text-xs text-muted">{m.candidate ? `Looks like ${m.candidate.name}.` : "No supplier looks like it."}</p>
                </div>
                {editable && (
                  <div className="flex gap-2">
                    {m.candidate && (
                      <Button
                        size="sm"
                        onClick={() => send({ type: "unlinked_name", name: m.name, supplier_id: m.candidate!.supplier_id, decision: "link" }, `Rows linked to ${m.candidate!.name}`)}
                        loading={decide.isPending}
                      >
                        Link
                      </Button>
                    )}
                    {!m.exact && (
                      <Button size="sm" variant="ghost" onClick={() => send({ type: "unlinked_name", name: m.name, decision: "not_same" }, `${m.name} added as its own supplier`)} disabled={decide.isPending}>
                        {m.candidate ? "Not the same" : "Add as a supplier"}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
