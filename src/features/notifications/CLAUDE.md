# P13 · Notifications

> Blueprint spec. Route `/notifications`. All roles. Also the bell popover in F2.
> Replaces `pages/NotificationsPage.tsx` (447) and the dropdown inside `components/TopBar.tsx`.
> Depends on: F3 `Tabs`, `EmptyState`, `Toast`; `NotificationContext` (SSE `/notifications/stream`) kept.

## Data

`notificationService.getNotifications(page, size, unreadOnly)`, `markAsRead`, `markAllAsRead`. Types: APPROVED, REJECTED, REMINDER, DEADLINE, ESCALATION (+ other).

## Layout

```
PageHeader "Notifications"  "{n} unread"   action: Mark all read
Tabs: All · Unread · Approvals · Rejections · Reminders   (server-side filters, proposed `type` param)
List grouped Today / Yesterday / This week / Earlier
 row: type icon (fixed status colour) · title · message (1 line) · time ago · ● unread
 expanded: who (reviewer), reason, date, [Open] → link
```

## Rules

- Filters apply server-side across all pages (today only current page). "Reminders" covers REMINDER, DEADLINE, ESCALATION consistently.
- Reviewer and reason as structured fields (proposed `meta` jsonb on Notification) instead of regex-parsing the message.
- Bell popover: last 8 unread, mark one/all, "See all". New-notification toast 5s (as today).

## Acceptance

Token colours only (today hard-coded hex); errors visible; keyboard navigable list.

## Uploads (IM4, 2026-10-12)
`UPLOAD_PENDING` (an import batch waiting for the manager's review, ESG-lite IM4) is kind `upload` in `src/ui/notificationKind.ts` (CloudUpload icon, info tone, label "Waiting for review"). The Notifications page has an "Uploads" tab (`?tab=uploads`, server group `type=uploads`); its link opens the batch in Approvals → Upload batches. Settings shows the `email_uploads` toggle to Managers and Admins.
