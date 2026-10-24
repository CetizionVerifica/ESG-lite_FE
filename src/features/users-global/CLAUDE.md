# P20 · Users (all clients)

> Blueprint spec. Route `/setup/users` (alias `/users` for Superadmin). Role: **Superadmin**. Setup list pattern (see P19).
> Replaces `pages/UserPage.tsx` (369; plain-text password editing in grid, no company column).

## Layout
```
PageHeader "Users"  Client ▾ · Role chips (Superadmin/Admin/Manager/User) · Site ▾ · search   action: Add user
DataTable: Person | Client | Role | Sites | Categories | Last active | ⋯ (Edit, Send reset link, Remove)
Drawer: Name, Last name, Email*, Phone, Role*, Client (required for non-superadmin; an Admin's own client, else derived from sites), Sites (multi for Manager/User; none for Admin), Categories (for User), Timezone
```
## Data
`userService` CRUD, `siteService.getSites`.
## Rules
No password column; create uses invite/temporary password shown once; Remove confirm. Role change warns about lost permissions.

## As built (one client per account, ESG-lite #130 / FE #182, carrying #120 / #171)
- A client account holds sites of one client only; the server refuses a mix with a 400. Picking sites keeps only the chosen client's.
- **Internal account** switch (Manager and User only, `is_internal`; hidden until the server sends `is_internal` on users, so an older backend never shows a switch it would drop): the team's own logins. An internal account picks from every client's sites ("Site · Client"), needs no client, and shows an "Internal" badge in the list and subtitle.
- Someone already holding several clients' sites (from before the rule) gets a warning naming the other client's sites, with "Keep only this client's sites". Save stays disabled while the save would send the sites or turn Internal off. A site with no client counts as another client's, as on the server.
- Turning Internal off keeps the chosen client if it still owns one of the picked sites, else the client owning most of them.
- After deploying ESG-lite #130 a Superadmin ticks Internal on existing cross-client team logins, or their site and role edits are refused.

## As built (an Admin belongs to a client, ESG-lite `user.company_id`)
- An Admin picks a **Client** only: no Site field. The save sends `company_id` (on create, a role change to Admin, or a client change); the server clears an Admin's sites. Rows show an Admin's client from `user.company`.
- The KPI topics field is for Managers and Users (site topics); an Admin's company-level topics are set in KPI setup.
