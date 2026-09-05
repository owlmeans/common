---
name: testing-overview
description: Decision matrix for which testing strategy to use per package in the OwlMeans Common monorepo (unit no-mocks / unit with auth-mocks / env-gated integration / Playwright acceptance) plus the eight invariants that apply to every package. Auto-invoked when "tests" or "testing" is mentioned.
---

# Testing Strategy — OwlMeans Common

Every package falls into exactly one of four testing categories. The category drives which `@owlmeans/test*` package(s) the tests depend on, where tests live, and what mocking is allowed.

`@owlmeans/test` is the base every category builds on — env loading, env gates and fixture loading
(`testing-unit` documents its exports). `@owlmeans/test-auth`, `@owlmeans/test-integration` and
`@owlmeans/test-ui` each add one category's helpers on top of it.

## Categories

| Cat | Strategy | Tests location | Runtime | Mocks? | Skill |
|-----|----------|----------------|---------|--------|-------|
| A | Unit, real sibling-package imports | `tests/*.spec.ts` | `bun test` | None | `testing-unit` |
| B | Unit with auth/authz mocks | `tests/*.spec.ts` | `bun test` | Only auth/authz, only via `@owlmeans/test-auth` | `testing-auth-unit` |
| C | Integration, env-gated | `tests/*.spec.ts` | `bun test` | None | `testing-integration` |
| D | Component-level acceptance, real chromium | `tests/*.spec.ts` | `bun test` (drives Playwright as a library) | None | `testing-ui` |

## Package → category map

All 101 packages, one category each.

- **A** (50): `agent`, `agent-common`, `agent-skills`, `api`, `api-config`, `api-config-client`, `api-config-server`, `astro`, `basic-ids`, `client-config`, `client-context`, `client-entrypoint`, `client-flow`, `client-job`, `client-resource`, `client-route`, `client-socket`, `config`, `consent`, `context`, `create-app`, `entrypoint`, `error`, `flow`, `i18n`, `iam`, `image-resource`, `llm-common`, `mailer`, `payment`, `queue`, `resource`, `route`, `router`, `server-auth-identity`, `server-context`, `server-entrypoint`, `server-iam`, `server-job`, `server-route`, `server-config`, `server-socket`, `server-wl`, `socket`, `state`, `static-resource`, `storage-common`, `web-db`, `web-gtm`, `web-router-react-router`
- **B** (20): `auth`, `auth-common`, `auth-otp`, `basic-envelope`, `basic-keys`, `client-auth`, `client-did`, `client-iam`, `client-payment`, `did`, `mui-oidc-rp`, `oidc`, `server-auth`, `server-auth-otp`, `server-oidc-provider`, `server-oidc-rp`, `web-auth`, `web-oidc-provider`, `web-oidc-rp`, `wled`
- **C** (14): `kluster`, `llm` (live inference providers), `mailer-smtp`, `mongo`, `mongo-resource`, `postgres`, `postgres-resource`, `redis`, `redis-queue`, `redis-resource`, `server-api`, `server-app`, `server-mailer-mailgun`, `storage-resource`
- **D** (11): `client`, `client-i18n`, `client-panel`, `client-wl`, `mui-panel`, `web-client`, `web-consent`, `web-flow`, `web-panel`, `web-router`, `web-wl`
- **None** (6): `dep-config`, `_tpl`, and the four harness packages themselves — `test`, `test-auth`, `test-integration`, `test-ui`

A **contract** package and its **backend** split across categories. `queue`, `resource`,
`storage-common` and `image-resource` are A — types, AJV schemas, error classes and declarations,
with nothing to connect to — while `redis-queue`, `mongo`, `postgres` and `storage-resource` (which
carries the S3 client) are C. Same for mail: `mailer` is A, `mailer-smtp` and
`server-mailer-mailgun` are C. The test is what the package's own code does at runtime, not what
its manifest lists: a package that only declares types, schemas and errors has no gate to write,
while one whose code issues real commands against the service is C even when it names no driver.
`redis-resource` imports `ioredis` for types alone and drives the client the db service hands it;
`mongo-resource` carries its driver as a devDependency, for its specs only. Both are C.

`web-router` is D, not A: it drives the History API, so its routing behaviour is only observable in
a browser and its specs mount a real harness in chromium. A client-side package stays in A when it
ships no component at all — `client-config`, `client-context`, `client-entrypoint`, `client-flow`,
`client-job`, `client-resource`, `client-route`, `client-socket`, `web-db`, `web-gtm` and
`web-router-react-router` are services, models and adapters, so `bun test` alone covers them.

A new package takes the category its own behaviour implies: an external service it cannot fake ⇒ C,
a rendered React surface ⇒ D, an authenticated identity it must stand in for ⇒ B, otherwise A.

## Eight invariants (apply everywhere)

1. **Tests live next to `src/` in `<your-package>/tests/`**, named `*.spec.ts`. They sit outside `rootDir: ./src/`, so the package `tsconfig.json` must list `"./tests/**/*"` in `exclude` — otherwise `tsc -b` tries to compile them and fails on the rootDir boundary.
2. **One real context per package**, set up in `tests/context.ts`. It builds a real `BasicContext` / server / client context (whatever the package documents in its `SKILL.md`), provisions real sibling-package services and resources, and exports a single helper specs import.
3. **Cross-package imports are real.** No mocks for sibling packages. Auth/authz is the only mockable boundary, only in category B, only via `@owlmeans/test-auth`.
4. **Don't test context wiring** in every package. Trust `@owlmeans/context`'s own tests.
5. **Don't test utils. Don't test types.** Max 3-4 tests per method/function.
6. **Cover the package's `SKILL.md` and `README.md` cases first.** Those are the documented consumption surfaces — tests validate them as executable specs before reaching for internal coverage.
7. **Env-gated provisioning** whenever a spec needs something the machine may not have: if a required env var is empty, neither the dependent service is provisioned in the test context nor are the specs that need it executed. Specs self-skip with a printed reason — never fail. Gates come from one of two places: `@owlmeans/test-integration` ships a ready-made one for each service it covers (PostgreSQL, MongoDB, Redis, S3, Kubernetes, SMTP), and a package whose provider is outside that set declares its own with `makeGates` from `@owlmeans/test` — `llm` does exactly that for its inference providers, and Mailgun's HTTP API needs the same. Both produce identical skip behaviour.
8. **No new mocks.** If a test seems to need a mock that isn't auth/authz, the test belongs in category C (and the package belongs in category C) — write an integration test, not a fake.

## Running tests

- All packages from root: `bun run test`
- One package: `cd <your-package> && bun test ./tests` — same line for every category
- Gated tests: `MONGO_URL=... bun run test`, or put the values in the repo-root `.env` that
  `loadEnv` picks up. Empty values skip cleanly; a missing `.env` is not an error
- One-time UI setup: `bunx playwright install chromium` (downloads the browser the `playwright` library drives in category D)

## What to test (always)

Services, components, helpers, and broad domain models that aren't already exposed via a service. Cover the `SKILL.md` use cases first, then the `README.md` examples, then any non-trivial invariants documented in code comments.

## What NOT to test

- Utils (`src/utils/*` or `src/utils.ts`) — internal package implementation.
- Type-only files (`src/types.ts`).
- Context plumbing — already covered by `@owlmeans/context`.
- Anything you'd need to mock a sibling OwlMeans package to test.
