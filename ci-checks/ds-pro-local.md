Head: 03aadfaf66457bb9246f524392331d4b4927ff34

Date (UTC): 2026-10-21

Reproduced `.github/workflows/ci.yml` locally (Node v22.22.0), with the CI dummy API env vars.

| Job / step | Result |
|---|---|
| CI has no production access (ci/check_ci_isolation.py) | PASS |
| No unreviewed delete calls | NOT RUN (pull_request only) |
| npm ci | PASS |
| Typecheck (tsc --noEmit) | PASS |
| Lint redesign code (lint:new) | PASS |
| Lint ratchet | NOT RUN (pull_request only) |
| Unit tests (Vitest) | PASS (225 files, 2074 tests) |
| Build | PASS |
| Playwright smoke tests (chromium) | PASS (463 passed, 2 skipped) |
