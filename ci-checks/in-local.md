Head: a165e8d477b644aa8ac0978976f225183fdf732f

Date (UTC): 2026-10-21

Reproduction of .github/workflows/ci.yml on in/local (Node v22.22.0, CI env vars set).

| Job / step | Result |
|---|---|
| CI has no production access (ci/check_ci_isolation.py) | PASS |
| No unreviewed delete calls (vs origin/production) | PASS |
| npm ci | PASS |
| Typecheck (tsc --noEmit) | PASS |
| Lint redesign code (lint:new, max-warnings 0) | PASS |
| Lint ratchet | NOT RUN (workflow runs it on pull requests only; no PR for this branch) |
| Unit tests (Vitest) | PASS: 265 files, 2349 tests |
| Build | PASS (chunk-size warning only) |
| Playwright smoke tests (chromium) | PASS: 515 passed, 2 skipped |

No failures.
