---
name: testing-overview
description: Decision matrix for which testing strategy to use per package in the OwlMeans Common monorepo (unit no-mocks / unit with auth-mocks / env-gated integration / Playwright acceptance) plus the eight invariants that apply to every package. Auto-invoked when "tests" or "testing" is mentioned.
---

# Testing Strategy — OwlMeans Common

Every package falls into exactly one of four testing categories. The category drives which `@owlmeans/test*` package(s) the tests depend on, where tests live, and what mocking is allowed.

## Categories

| Cat | Strategy | Tests location | Runtime | Mocks? | Skill |
|-----|----------|----------------|---------|--------|-------|
| A | Unit, real sibling-package imports | `tests/*.spec.ts` | `bun test` | None | `testing-unit` |
| B | Unit with auth/authz mocks | `tests/*.spec.ts` | `bun test` | Only auth/authz, only via `@owlmeans/test-auth` | `testing-auth-unit` |
| C | Integration, env-gated | `tests/*.spec.ts` | `bun test` | None | `testing-integration` |
| D | Component-level acceptance, real chromium | `tests/*.spec.ts` | `bun test` (drives Playwright as a library) | None | `testing-ui` |

## Package → category map

- **A** (~31): `basic-ids`, `context`, `config`, `error`, `flow`, `i18n`, `module`, `route`, `router`, `resource`, `socket`, `state`, `static-resource`, `client-route`, `client-config`, `client-context`, `client-resource`, `client-module`, `client-flow`, `client-socket`, `server-route`, `server-config`, `server-context`, `server-module`, `payment`, `api`, `api-config`, `api-config-client`, `api-config-server`, `web-router`, `web-db`
- **B** (~13): `auth`, `auth-common`, `basic-keys`, `basic-envelope`, `did`, `client-auth`, `client-did`, `server-auth`, `oidc`, `server-oidc-rp`, `server-oidc-provider`, `web-oidc-rp`, `web-oidc-provider`, `wled`, `client-payment`
- **C** (~10): `mongo`, `mongo-resource`, `redis`, `redis-resource`, `kluster`, `storage-common`, `storage-resource`, `image-resource`, `server-api`, `server-app`, `queue`
- **D** (~8): `client`, `client-i18n`, `client-panel`, `client-wl`, `web-client`, `web-flow`, `web-panel`, `web-wl`
- **None**: `dep-config`, `_tpl`

## Eight invariants (apply everywhere)

1. **Tests live next to `src/` in `packages/<pkg>/tests/`**, named `*.spec.ts`. They are outside `rootDir: ./src/` so `tsc -b` already excludes them.
2. **One real context per package**, set up in `tests/context.ts`. It builds a real `BasicContext` / server / client context (whatever the package documents in its `SKILL.md`), provisions real sibling-package services and resources, and exports a single helper specs import.
3. **Cross-package imports are real.** No mocks for sibling packages. Auth/authz is the only mockable boundary, only in category B, only via `@owlmeans/test-auth`.
4. **Don't test context wiring** in every package. Trust `@owlmeans/context`'s own tests.
5. **Don't test utils. Don't test types.** Max 3-4 tests per method/function.
6. **Cover the package's `SKILL.md` and `README.md` cases first.** Those are the documented consumption surfaces — tests validate them as executable specs before reaching for internal coverage.
7. **Env-gated provisioning** for category C: if a required env var is empty, neither the dependent service is provisioned in the test context nor are the specs that need it executed. Specs self-skip with a printed reason — never fail.
8. **No new mocks.** If a test seems to need a mock that isn't auth/authz, the test belongs in category C (and the package belongs in category C) — write an integration test, not a fake.

## Running tests

- All packages from root: `bun run test`
- One package: `cd packages/<pkg> && bun test ./tests` — same line for every category
- Integration tests: `MONGO_URL=... bun run test` — empty values skip cleanly
- One-time UI setup: `bunx playwright install chromium` (downloads the browser the `playwright` library drives in category D)

## What to test (always)

Services, components, helpers, and broad domain models that aren't already exposed via a service. Cover the `SKILL.md` use cases first, then the `README.md` examples, then any non-trivial invariants documented in code comments.

## What NOT to test

- Utils (`src/utils/*` or `src/utils.ts`) — internal package implementation.
- Type-only files (`src/types.ts`).
- Context plumbing — already covered by `@owlmeans/context`.
- Anything you'd need to mock a sibling OwlMeans package to test.
