# P20 · Users (all clients)

> Blueprint spec. Route `/setup/users` (alias `/users` for Superadmin). Role: **Superadmin**. Setup list pattern (see P19).
> Replaces `pages/UserPage.tsx` (369; plain-text password editing in grid, no company column).

## Layout
```
PageHeader "Users"  Client ▾ · Role chips (Superadmin/Admin/Manager/User) · Site ▾ · search   action: Add user
DataTable: Person | Client | Role | Sites | Categories | Last active | ⋯ (Edit, Send reset link, Remove)
Drawer: Name, Last name, Email*, Phone, Role*, Client (derived from sites; required for non-superadmin), Sites (multi for Manager/User; single optional for Admin), Categories (for User), Timezone
```
## Data
`userService` CRUD, `siteService.getSites`.
## Rules
No password column; create uses invite/temporary password shown once; Remove confirm. Role change warns about lost permissions.
