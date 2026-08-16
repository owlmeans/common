# @owlmeans/test

Foundation helpers shared by the OwlMeans test packages and individual package test suites.

- `loadEnv(opts?)` — locate `<monorepo-root>/.env`, parse it, merge into `process.env` (idempotent; no-op when Bun already loaded the file via `--env-file`).
- `requireEnv(keys)` — returns `{ ok: true }` or `{ skip: true, reason }` so callers can `test.skip(...)` when an integration variable is missing.
- `hasEnv(key)` — boolean shorthand for conditional service provisioning in `tests/context.ts`.
- `makeGates(spec)` — builds a frozen record of `{ <name>: { skip, reason } }` so a per-package `tests/context.ts` exposes one source of truth and individual specs can self-skip.
- `loadFixture<T>(relPath)` — JSON fixture loader rooted at the consuming package's `tests/fixtures/`.

Tests must be located at `packages/<pkg>/tests/`, named `*.spec.ts`. See the `testing-overview` skill for the full strategy.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
