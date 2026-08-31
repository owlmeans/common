# @owlmeans/test-integration

Env-gated harness for integration tests of packages that talk to external services (MongoDB, Redis, S3-compatible storage, Kubernetes). Bundles helper gates and per-run namespacing — the actual driver libraries (`mongodb`, `ioredis`, `@aws-sdk/client-s3`, `@kubernetes/client-node`) stay where they already live, in the consuming integration packages.

Helpers exported here:

- `mongoGate()`, `redisGate()`, `s3Gate()`, `kubeGate()` — read the env keys documented in `.env.example` and return `{ skip, reason?, env }`. A `tests/context.ts` uses these to decide whether to register the corresponding service in the real test context.
- `randomNamespace(prefix)` — short random suffix to keep DB names, key prefixes, and S3 prefixes unique per test run so suites can safely run in parallel.
- `registerCleanup(fn)` + `runCleanups()` — opt-in `afterAll` cleanup queue.

Specs do not call services through these helpers — they consume the per-package real test context built in `tests/context.ts` and only check `gates.<svc>.skip` to self-skip when the dependency is missing. See `testing-integration` skill for the full pattern.

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
