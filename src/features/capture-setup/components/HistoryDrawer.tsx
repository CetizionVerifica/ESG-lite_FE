import { Badge, Drawer, EmptyState, formatDateTime } from "../../../ui";
import { useFormVersions } from "../api";
import { versionChanges } from "../check";
import { errorMessage } from "../logic";

/** SE-4 · A form's published versions, newest first: who, when, why, and what changed from the one before. */
export function HistoryDrawer({ formId, open, onClose }: { formId: number; open: boolean; onClose: () => void }) {
  const versions = useFormVersions(formId, open);
  const list = versions.data?.versions ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title="Form history"
      subtitle={versions.data ? `Live: version ${versions.data.version}` : undefined}
      loading={versions.isPending && open}
      error={versions.isError ? errorMessage(versions.error, "Couldn't load the history.") : null}
      onRetry={() => void versions.refetch()}
    >
      {versions.data && list.length === 0 && (
        <EmptyState title="No versions yet." description={`The form is version ${versions.data.version}. Saving it once it passes the check records the version contributors use.`} />
      )}
      <ol className="space-y-4" data-testid="form-history">
        {list.map((v, i) => {
          const previous = list[i + 1];
          const changes = previous ? versionChanges(previous.config, v.config) : [];
          return (
            <li key={v.version} className="border-b border-line pb-3 last:border-b-0" data-version={v.version}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">Version {v.version}</h3>
                {v.version === versions.data?.version && <Badge tone="good">Live</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {[v.published_by?.name, formatDateTime(v.published_at)].filter(Boolean).join(" · ")}
              </p>
              {v.note && <p className="mt-1 text-sm text-ink">{v.note}</p>}
              {previous ? (
                changes.length ? (
                  <dl className="mt-2 space-y-1 text-sm">
                    {changes.map((c) => (
                      <div key={c.setting} className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3">
                        <dt className="text-muted">{c.setting}</dt>
                        <dd className="min-w-0 break-words">{c.detail}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-1 text-xs text-muted">No setting changed.</p>
                )
              ) : (
                <p className="mt-1 text-xs text-muted">The first version recorded.</p>
              )}
            </li>
          );
        })}
      </ol>
    </Drawer>
  );
}
