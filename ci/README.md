# CI safety checks

`.github/workflows/ci.yml` runs on every pull request into `redesign/integration`
or `main`, and on pushes to them. It never reaches production: the workflow
holds no secrets, the build overrides the committed `.env` with a dead local
API URL, and no step calls a backend.

| Check | What fails it |
|---|---|
| CI has no production access | a workflow references a secret or a production DB variable |
| No unreviewed delete calls | an added line in `src/` calls `.delete(`, uses `method: "DELETE"` or a bulk/purge delete endpoint without a `// data-loss-reviewed: <reason>` comment on or above it |
| Typecheck | `tsc --noEmit` errors |
| Lint redesign code | `npm run lint:new` (once that script exists) reports anything |
| Lint ratchet | any file has more ESLint problems than on the base branch, or a new file has any |
| Unit tests | `npm test` (once that script exists) fails |
| Build | `npm run build` fails |

A new delete in the UI is fine when the user confirms first and sees what
will be deleted. Say so in the marker comment, for example
`// data-loss-reviewed: confirm dialog lists the batch's rows; manager-only`.
