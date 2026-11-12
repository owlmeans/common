---
name: testing-overview
description: Decision matrix for which testing strategy to use per package in the OwlMeans Common monorepo (unit no-mocks / unit with auth-mocks / env-gated integration / Playwright acceptance) plus the eight invariants that apply to every package. Auto-invoked when "tests" or "testing" is mentioned.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Testing Strategy — OwlMeans Common

Every package falls into exactly one of four testing categories. The category drives which `@owlmeans/test*` package(s) the tests depend on, where tests live, and what mocking is allowed.

`@owlmeans/test` is the base every category builds on; each other harness package adds one
category's helpers on top of it:

| Package | Main exports | Documented in |
|---|---|---|
| `@owlmeans/test` | `loadEnv`, `requireEnv`, `hasEnv`, `makeGates`, `loadFixture` | `testing-unit` |
| `@owlmeans/test-auth` | `makeFixtureKeyPair`, `makeMemoryTrustedResource`, `makeMockGuard`, `withAuth`, `signMockEnvelope`, `makeBearer`, fixtures `SUPERUSER`/`USER`/`SERVICE` | `testing-auth-unit` |
| `@owlmeans/test-integration` | `mongoGate`, `redisGate`, `s3Gate`, `kubeGate`, `randomNamespace`, `registerCleanup`, `runCleanups` | `testing-integration` |
| `@owlmeans/test-ui` | `launchBrowser`, `closeBrowser`, `withPage`, `mountComponent`, `makePageHelper` (consent, supervisor and e-mail sign-in), `supervisorAuthHelper`, `makeEmailTechClient`, starter `harness/index.html` — on the `playwright` library, not `@playwright/test` | `testing-ui` |

New auth mocks belong in `@owlmeans/test-auth`, never in a package's own `tests/`.

## Categories

| Cat | Strategy | Tests location | Runtime | Mocks? | Skill |
|-----|----------|----------------|---------|--------|-------|
| A | Unit, real sibling-package imports | `tests/*.spec.ts` | `bun test` | None | `testing-unit` |
| B | Unit with auth/authz mocks | `tests/*.spec.ts` | `bun test` | Only auth/authz, only via `@owlmeans/test-auth` | `testing-auth-unit` |
| C | Integration, env-gated | `tests/*.spec.ts` | `bun test` | None | `testing-integration` |
| D | Component-level acceptance, real chromium | `tests/*.spec.ts` | `bun test` (drives Playwright as a library) | None | `testing-ui` |

## Package → category map

146 packages, one category each.

- **A** (80): `agent`, `agent-common`, `agent-skills`, `api`, `api-config`, `api-config-client`, `api-config-server`, `astro`, `auth-email`, `auth-token`, `basic-ids`, `bot`, `bot-agent`, `captcha`, `cli-auth`, `client-config`, `client-context`, `client-entrypoint`, `client-flow`, `client-job`, `client-planning`, `client-resource`, `client-route`, `client-socket`, `client-upload`, `common-inquiry`, `config`, `consent`, `context`, `create-app`, `dep-config`, `entrypoint`, `error`, `file-inspector`, `flow`, `i18n`, `iam`, `image-resource`, `job`, `llm-common`, `log`, `mailer`, `marketing-consent`, `oauth`, `payment`, `planning`, `planning-auth`, `queue`, `resource`, `route`, `router`, `server-auth-identity`, `server-auth-session`, `server-auth-token`, `server-bot`, `server-config`, `server-context`, `server-entrypoint`, `server-iam`, `server-job`, `server-oauth`, `server-planning`, `server-route`, `server-socket`, `server-wl`, `socket`, `state`, `static-resource`, `storage-common`, `upload`, `viable-common`, `viable-log`, `viable-sdk`, `web-auth-email`, `web-auth-token`, `web-captcha`, `web-db`, `web-inquiry`, `web-log`, `web-router-react-router`
- **B** (23): `auth`, `auth-common`, `auth-otp`, `basic-envelope`, `basic-keys`, `client-auth`, `client-did`, `client-iam`, `client-payment`, `did`, `mui-oidc-rp`, `oidc`, `server-auth`, `server-auth-email`, `server-auth-otp`, `server-marketing-consent`, `server-oidc-provider`, `server-oidc-rp`, `server-upload`, `web-auth`, `web-oidc-provider`, `web-oidc-rp`, `wled`
- **C** (21): `bot-postgres`, `file-streams`, `kluster`, `llm` (live inference providers), `llm-reader` (live models, the public web), `llm-reader-playwright` (a browser), `mailer-smtp`, `marketing-consent-mongo`, `marketing-consent-postgres`, `mongo`, `mongo-resource`, `planning-postgres`, `postgres`, `postgres-resource`, `redis`, `redis-queue`, `redis-resource`, `server-api`, `server-app`, `server-payment`, `storage-resource`
- **D** (16): `client`, `client-i18n`, `client-panel`, `client-wl`, `mui-panel`, `web-bot`, `web-client`, `web-consent`, `web-flow`, `web-marketing-consent`, `web-oauth`, `web-panel`, `web-payment`, `web-router`, `web-upload`, `web-wl`
- **None** (6): `_tpl`, and the five harness packages themselves — `test`, `test-auth`, `test-integration`, `test-payment`, `test-ui`

A **contract** package and its **backend** split across categories. `queue`, `resource`,
`storage-common` and `image-resource` are A — types, AJV schemas, error classes and declarations,
with nothing to connect to — while `redis-queue`, `mongo`, `postgres` and `storage-resource` (which
carries the S3 client) are C. Same for mail: `mailer` is A, `mailer-smtp` is C. The test is what the package's own code does at runtime, not what
its manifest lists: a package that only declares types, schemas and errors has no gate to write,
while one whose code issues real commands against the service is C even when it names no driver.
`redis-resource` imports `ioredis` for types alone and drives the client the db service hands it;
`mongo-resource` carries its driver as a devDependency, for its specs only. Both are C.

A C package keeps every spec it can offline. `storage-resource` opens `s3Gate` only for the
round trips against a real store (`create.spec.ts`, the bucket half of `ensure.spec.ts`); its
bucket-model, upload-verification and start-up-ensure specs run with no gate against local
stand-ins (`tests/harness`: a silent server, a closed port, an unreachable store that a refused body
never reaches). `file-streams` gates only `s3.spec.ts` and `backed.spec.ts` the same way. `file-inspector`, `upload`, `storage-common` and `client-upload` are A: bytes,
schemas and a stand-in server on a local port. `server-upload` is B (a mock guard from
`@owlmeans/test-auth` in front of its handlers) and `web-upload` D.

`server-auth-otp` and `server-auth-email` are B — they sign and verify through a fixture trusted key
— and carry env-gated Redis/Mongo specs (`redisGate`, `mongoGate`) for their stores, exactly as a C
package would. `agent` is A the same way: its one live spec (`media-live.spec.ts`) opens a
`makeGates` gate on the provider secrets and self-skips without them. `captcha` is A: it names no captcha service, so its specs register a stand-in
`CaptchaProvider` in the captcha host — the plugin seam, not a mock. `web-captcha` and
`web-auth-email` are A: their specs drive stand-in `CaptchaClient`s and the pure halves
(`captchaNoticeHelper`, `emailLoginStateHelper`, `emailRefusalHelper`, the storage helper, the
offer step, the panel helper, i18n parity); the rendered card is an application's e2e concern. A
provider's own service (siteverify, a script loader) is tested in its connect package, over an
injected `fetch` or a stand-in `document`/`window`.

`server-bot` is A although its platforms are external services: they are reached only through the
plugin seam, and its own API-faithful mock transport (a shipped feature, not a test mock) or a
spec's `fetch` answering a platform's documented envelopes stands in for them; its store is any
`Resource` (static resources in its specs). Its Postgres store, `bot-postgres`, is C.

`web-router` is D, not A: it drives the History API, so its routing behaviour is only observable in
a browser and its specs mount a real harness in chromium. A client-side package stays in A when it
ships no component at all — `client-config`, `client-context`, `client-entrypoint`, `client-flow`,
`client-job`, `client-resource`, `client-route`, `client-socket`, `web-db`, `web-inquiry`
and `web-router-react-router` are services, models and adapters, so `bun test` alone covers them.

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
