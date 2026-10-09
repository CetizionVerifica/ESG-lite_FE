import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type Crumb = { label: string; to?: string };

export type HeaderAction = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
};

export type PageHeaderProps = {
  title: ReactNode;
  crumb?: Crumb[];
  /** One line under the title. */
  description?: ReactNode;
  /** Usually <ContextChips />. */
  context?: ReactNode;
  primaryAction?: HeaderAction;
  secondaryActions?: HeaderAction[];
  /** Shows a title placeholder while the record loads. */
  loading?: boolean;
  className?: string;
};

/** Page title row: breadcrumb, title, context chips and actions. One per page. */
export function PageHeader({ title, crumb, description, context, primaryAction, secondaryActions = [], loading, className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      {crumb && crumb.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {crumb.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden className="size-3" />}
                {c.to ? (
                  <Link to={c.to} className={cn("rounded-chip hover:text-ink hover:underline", focusRing)}>
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === crumb.length - 1 ? "page" : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-56" />
          ) : (
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
          )}
          {description && !loading && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {(primaryAction || secondaryActions.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryActions.map((a) => (
              <Button key={a.label} onClick={a.onClick} icon={a.icon} disabled={a.disabled || loading} loading={a.loading}>
                {a.label}
              </Button>
            ))}
            {primaryAction && (
              <Button
                variant="primary"
                onClick={primaryAction.onClick}
                icon={primaryAction.icon}
                disabled={primaryAction.disabled || loading}
                loading={primaryAction.loading}
              >
                {primaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
      {context}
    </header>
  );
}
