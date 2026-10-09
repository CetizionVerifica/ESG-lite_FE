# P14 · Settings (personal)

> Blueprint spec. Route `/settings` (avatar menu). All roles.
> Replaces `pages/SettingsPage.tsx` (347).
> Depends on: F3 `Toggle`, `Combobox`, `SegmentedControl`.

## Sections (left tab list on desktop, stacked on mobile)
1. **Profile** — name, last name, phone, email (read-only), role (read-only), sites (read-only). Change password (current, new, confirm, min 8).
2. **Appearance** — Light / Dark / System (stored in `User.appearance`, proposed B2; localStorage fallback). Shows the client's theme name ("Midal Cables · Classic") read-only; client looks are set by the client, not per user.
3. **Notifications** — email toggles by role: User (Approvals, Rejections, Deadline reminders by the 10th), Manager (Escalations by the 15th, + Daily approvals digest proposed), Admin/Superadmin (today an empty card → show "No email notifications for your role yet").
4. **Timezone** — searchable IANA list with offset, "Auto-detected" tag; note "Reminders are sent at 8:00 AM your time".

## Data
`notificationService.getPreferences/updatePreferences`; profile update endpoint (proposed `PATCH /auth/me`).

## Rules
Save per section with toast; errors visible (today silent on load and save).
