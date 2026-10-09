import { AlertTriangle, Bell, CheckCircle, Clock, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { type NotificationKind, notificationKind } from "./notificationKind";

// Status colours are fixed tokens; the icon carries the meaning too.
const KIND: Record<NotificationKind, { icon: LucideIcon; tone: string; soft: string }> = {
  approved: { icon: CheckCircle, tone: "text-good", soft: "bg-good-soft" },
  rejected: { icon: XCircle, tone: "text-bad", soft: "bg-bad-soft" },
  reminder: { icon: Clock, tone: "text-warn", soft: "bg-warn-soft" },
  escalation: { icon: AlertTriangle, tone: "text-warn", soft: "bg-warn-soft" },
  other: { icon: Bell, tone: "text-info", soft: "bg-info-soft" },
};

/** Type icon for a notification, optionally on its soft status tile. */
export function NotificationIcon({ type, tile, className }: { type: string; tile?: boolean; className?: string }) {
  const k = KIND[notificationKind(type)];
  const Icon = k.icon;
  if (!tile) return <Icon aria-hidden className={cn("size-4 shrink-0", k.tone, className)} />;
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-control", k.soft, className)}>
      <Icon aria-hidden className={cn("size-4", k.tone)} />
    </span>
  );
}
