# plan-progress

A Claude Code mod that shows how far the ESGLite redesign and PCF plan has got, read live from the pull requests into `redesign/integration` in ESG-lite_FE, ESG-lite and python_AI_service.

- **Status line** under the prompt, for example `Plan 21/53 done · 4 in review · next M1 6/11`. Refreshed when a session starts and every 15 minutes.
- **`/plan-progress`** opens a pane: modules per phase as done / in review / in progress / not started, and what is left for the next milestone (M0–M3) and for the PCF MVP. Press `r` (or Refresh) to read GitHub again.

## Install

In a Claude Code terminal session:

```
/plugin install plan-progress --marketplace CetizionVerifica/ESG-lite_FE
```

Answer `y` to add the marketplace, then pick the user scope.

It reads GitHub through `gh` when `gh auth status` is signed in; otherwise it uses `GITHUB_TOKEN` (or `GH_TOKEN`) from the environment.

## How a module's status is worked out

Same convention as `/next-module` and `/phase-gate`:

- **done**: a merged PR has `Completes: <ID>` in its body, or its title is `[<ID>]` or `[<ID> n/n]`. Modules merged before the convention (F1, F2, F3-1, B1–B8) count as done.
- **in review**: an open, non-draft PR titled `[<ID> …]`.
- **in progress**: an open draft PR, or some parts merged (shown as `E1 1/5`).
- **not started**: nothing yet.

The module list per phase is `GROUPS` in `hooks/plan.ts`; edit it there if the plan changes.

## Develop

```
claude plugin validate .claude/mods/plan-progress
claude plugin test .claude/mods/plan-progress
```
