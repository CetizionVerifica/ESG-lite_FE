# P01 · Sign in, Super-admin sign in, Reset password

> Blueprint spec. Routes `/login`, `/superadmin/login`, `/reset-password?token=`. Public.
> Replaces `pages/Login.tsx`, `AdminLogin.tsx`, `ResetPassword.tsx`.
> Depends on: F1 (client theme before login), F3 `TextField`, `PoweredBy`.

## Job to be done
"Sign in to something that feels like my company's tool."

## Theming before login (key feature)
The client theme must apply on the sign-in page. Options (team lead picks; default = **a**):
a) Client-specific URL `/{clientSlug}/login` or subdomain `midal.esglite.app` → public endpoint `GET /brands/public/:slug` returns name, colours, logo only (proposed).
b) Generic page in PlanetPulse theme; after the user types an email, look up the domain (`@midalcable.com`) and re-skin.

## Layout
```
┌ Cover (55%) — gradient cover-from → cover-to ┐┌ Form (45%) on --t-panel ─────────┐
│ client logo (on-dark)                        ││ Sign in                            │
│ "Carbon reporting for {Client}"              ││ Use your company email.           │
│ one line about their plants/products         ││ Email   [name@client.com]          │
│ subtle line art                              ││ Password [••••••] 👁               │
│                                              ││ [Sign in] (loading state)          │
│                                              ││ Forgot password?                   │
│                                              ││ ●●●● Powered by PlanetPulse ESGLite│
└──────────────────────────────────────────────┘└────────────────────────────────────┘
Mobile: cover becomes a 120px header band.
```

## Rules
- One visual system for all three screens (today AdminLogin is a bare card, Reset is different again). Super-admin sign-in uses PlanetPulse theme and says "PlanetPulse staff sign in".
- Product name is **ESGLite** everywhere (today "Emission Lite" vs "ESG Lite").
- Sign in button shows loading and is disabled while pending. Error messages inline under the form.
- Wrong door: a Superadmin on `/login` gets "Use the staff sign-in" with a link to `/superadmin/login` (today points to a wrong path); a non-superadmin on staff sign-in is **signed out** and told to use `/login` (today left authenticated).
- Forgot password: inline panel swap (not a modal): email → "If that email exists, we've sent a link".
- Reset: verifying, invalid/expired, form, success states; show/hide + strength meter; min length 8 everywhere (onboarding today uses 6 — align).
- Redirect after login per role (F2 `RootRedirect`); remove dead `Employee → /expenses`.

## Acceptance
Midal user sees Midal cover and logo; contrast passes; works at 390px; no `alert()`.

## Build notes (P01, ESG-lite_FE #74)
- Option **a**, frontend only: `/{clientSlug}/login` reads `GET /brands/public/:slug` through `usePublicBrand` and falls back to PlanetPulse on any error. Shyam chose "not now" for that endpoint (2026-10-09; the closed ESG-lite #61 has a ready slug column + route), so every sign-in page is PlanetPulse until a later module adds it.
- The client theme is applied to the sign-in subtree only (`AuthLayout` sets the pack's `--t-*` vars), so the app-wide ThemeProvider is untouched.
- Wrong door signs the person out straight away (`useSignIn`), on both doors. `/admin/login` redirects to `/superadmin/login`.
- Forgot password never says whether the address exists; only a 5xx or network error is shown.
- Min password length lives in `logic.ts` (`MIN_PASSWORD_LENGTH`). Onboarding's 6 is fixed when P17 (client onboarding) is rebuilt.
- Legacy Login/AdminLogin/ResetPassword stay until the route switch for good (flag off = unchanged).
