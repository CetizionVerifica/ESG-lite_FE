import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

/** A pulsing placeholder block. Decorative; wrap groups in <Loading> for screen readers. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden style={style} className={cn("block animate-pulse rounded-control bg-tint", className)} />;
}

/** Announces loading once for a group of skeletons. */
export function Loading({ label = "Loading", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Loading className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </Loading>
  );
}

/** Table body placeholder: `rows` rows of `columns` cells at the current row height. */
export function SkeletonTableRows({ rows = 5, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <Loading label="Loading rows" className={cn("divide-y divide-line", className)}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-row items-center gap-4 px-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3", c === 0 ? "w-1/4" : "flex-1")} />
          ))}
        </div>
      ))}
    </Loading>
  );
}

export function SkeletonKpi({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <Loading label="Loading figures" className={cn("flex gap-4 sm:gap-6", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-full max-w-20" />
          <Skeleton className="h-7 w-full max-w-28" />
          <Skeleton className="h-3 w-2/3 max-w-14" />
        </div>
      ))}
    </Loading>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  const bars = [40, 65, 50, 80, 55, 70, 45, 60];
  return (
    <Loading label="Loading chart" className={cn("flex h-48 items-end gap-3 px-2", className)}>
      {bars.map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
      ))}
    </Loading>
  );
}
