# IM10 · Connect Claude screens (ESG-lite_FE)

> Blueprint spec. Goes to `ESG-lite_FE/src/features/oauth-consent/CLAUDE.md` and `src/features/connected-apps/CLAUDE.md`.
> Depends on: IM5 API contract (mock with `page.route` until merged); IM2 batches `channel`. Lane L4.
> Follows the FE root CLAUDE.md (folders, src/ui, tokens only, definition of done).

## Outcome
Superadmins see what they're allowing and can disconnect Claude at any time; managers can tell Claude uploads apart. Only Superadmins can connect (D4).

## Build
1. **Consent page** `/oauth/consent?request=<id>` (route id `oauth-consent`; signs in first if needed and returns; any role but Superadmin sees "Only ESGLite staff (Superadmin) can connect Claude" and no Allow button). Shows the app name from registration, the user's name and client, what it can do ("read your sites, categories and forms", "create entries for review; it can't approve, edit or delete"), Allow / Deny. Brand theme of the user's client. Posts to `/oauth/authorize/decision`, then follows the redirect. Refuses with a message when the client's switch is off.
2. **Connected apps** in Settings, Superadmin only (P14 tab "Connected apps", `/settings?tab=apps`, hidden for other roles): list of grants (app, connected on, last used, scopes), Disconnect with confirm (`DELETE /oauth/grants/:id`). Empty state explains how to add ESGLite in Claude (the connector URL `<API_BASE>/mcp`, with a copy button).
3. **Batch source chip** in P07 Upload batches: "Claude" / "Bulk upload" / "Historical" from `channel`, filterable.
4. **Client switch** in P17 client detail (Superadmin): "Allow Claude imports" toggle bound to `mcp_enabled`, with a one-line explanation.

## Own tests
Unit: consent copy for Superadmin vs refused roles, scopes → sentences. Playwright: consent allow and deny (mocked), Connected apps list and disconnect, batch chip filter, client switch. Definition of done items 1–5 (themes, states, keyboard, widths).

## Audit rows
MCP-03, MCP-05, MCP-14 (chip), MCP-25.

## As built (2026-10-12, ESG-lite_FE, IM10)

Where the four parts live (the FE rule "pages never import from another feature folder" decided this; there is no separate `connected-apps` folder):
1. **Consent page**: this folder. Shell route `oauth-consent` → `/oauth/consent` (one line in `src/features/shell/routeMap.ts`, all roles). It renders inside the app shell as a centred card. Data: `GET /oauth/authorize/request?request=` and `POST /oauth/authorize/decision` (`src/services/oauthService.ts`, hooks in `api.ts`). Pure rules in `logic.ts`: scope sentences, the Superadmin gate (checked against the server's `can_allow` and the session role), the "no client has imports on" hint, http(s)-only redirects, error mapping.
   - Signed out: the shell's `ProtectedRoute` now passes `state.from`; `useSignIn` returns there (`returnPath` in sign-in `logic.ts`, in-app paths only) and the wrong-door link keeps the state, so a Superadmin who lands on the company door gets back to the request from the staff door.
   - Refused roles see the message, no Allow, and "Back to Claude" (the server's `redirect_to` with `error=access_denied`).
   - The client's switch is not checked at consent (a Superadmin's grant is not tied to one client, D4); the page hints when no client has imports on.
2. **Connected apps**: `src/features/settings/components/ConnectedAppsSection.tsx`, section id `apps`, Superadmin only (`sectionsFor`), `/settings?tab=apps` scrolls to it (`sectionFromTab`). `GET /oauth/grants`, `DELETE /oauth/grants/:id` through `settings/api.ts`. Empty state shows how to add ESGLite in Claude with the connector URL (`connector_url` from the server) and a Copy button; the list shows app, connected on, last used, scopes, Disconnect (destructive modal).
3. **Batch source chip**: P07 Upload batches gets a Source column (Claude / Bulk upload / Historical / API) from `channel` (`batchSource` in approvals-ledger `logic.ts`; absent = Bulk upload) and a Source select bound to `?source=`. Needs the backend batches endpoint to return `channel` (IM2 / lane 2); until then every batch reads Bulk upload.
4. **Client switch**: `src/features/clients/components/ClaudeImportsToggle.tsx` under the Overview tab, bound to `mcp_enabled` via `PUT /admin/companies/:id` (IM5).

Tests: `logic.test.ts` here; `settings/logic.test.ts`, `approvals-ledger/logic.test.ts`, `sign-in/logic.test.ts` extended; Playwright `e2e/oauth-consent.spec.ts` (allow, deny, three refused roles, expired request, sign-in round trip, 390 px), plus new cases in `settings.spec.ts`, `approvals-ledger.spec.ts`, `clients.spec.ts`.
