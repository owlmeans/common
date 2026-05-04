---
applyTo: "packages/{mongo,mongo-resource,redis,redis-resource,kluster,storage-common,storage-resource,image-resource,server-api,server-app,queue}/tests/**"
---

# Category C — Integration Tests (env-gated)

- Tests in `packages/<pkg>/tests/*.spec.ts`. Use `bun:test`.
- No mocks. Connect to real MongoDB / Redis / S3 / Kubernetes via the env values supplied by `<root>/.env`.
- Open the gate at the top of `tests/context.ts` via `mongoGate()` / `redisGate()` / `s3Gate()` / `kubeGate()`. If `gate.skip`, do **not** register that service in the test context, and have specs self-skip with `gate.reason`.
- Always `randomNamespace(prefix)` databases / key prefixes / S3 prefixes for parallel safety.
- Always `registerCleanup(fn)` for resources you provision; call `runCleanups()` in `afterAll`.
- `<root>/.env.example` is the authoritative documentation of every variable. Add a new key there with a comment when you introduce a new gate.
- Per-package `package.json` script: `"test": "bun test ./tests"`. Long round-trips: bump timeout in a per-package `bunfig.toml`.
- Cover `.claude/skills/<pkg>/SKILL.md` and `README.md` cases first.
- Max 3-4 tests per method/function.

See `.claude/skills/testing-integration/SKILL.md` for the full pattern.
