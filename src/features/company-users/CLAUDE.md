# P15 · Company users (company Admin)

> Blueprint spec. Route `/users` (alias `/admin-company/users`). Role: **Admin**.
> Replaces `pages/CompanyAdmin/CompanyAdminUsersPage.tsx` (331, no dark mode).
> Depends on: F3 `DataTable`, `Drawer`, `Modal` (destructive), `Combobox` multi.

## Data
`companyAdminService`: getCompanyUsers, getCompanySites, createCompanyUser, updateCompanyUser, deleteCompanyUser.

## Layout
```
PageHeader "People"  search · Role chips (All/Manager/User) · Site ▾   action: Invite person
KpiStrip (small): People | Managers | Contributors | Sites without a manager (warn)
DataTable: Person (avatar, name, email) | Role pill | Sites | Categories granted | Last active | ⋯ (Edit, Reset password, Remove)
Drawer "Invite person" / "Edit": Name, Email, Role (Manager|User), Sites (multi), [Send invite email] (proposed) or temporary password
```
## Rules
- **No passwords in the table** (today plain-text inline editing). Use "Send reset link" (`authService.forgotPassword`) or invite email.
- Remove → confirm modal naming the person and what happens to their entries (kept, attributed).
- Form resets after success; errors clear on change.
- Admin may view the company Brand theme read-only (link to P18 view mode).
