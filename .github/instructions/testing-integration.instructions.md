---
applyTo: "packages/{postgres,postgres-resource,mongo,mongo-resource,redis,redis-resource,kluster,storage-common,storage-resource,image-resource,server-api,server-app,queue,llm}/tests/**"
---

# Category C — Integration Tests (env-gated)

- Tests in `<your-package>/tests/*.spec.ts`. Use `bun:test`.
- No mocks. Connect to real PostgreSQL / MongoDB / Redis / S3 / Kubernetes via the env values supplied by `<root>/.env`.
- Open the gate at the top of `tests/context.ts` via `postgresGate()` / `mongoGate()` / `redisGate()` / `s3Gate()` / `kubeGate()`. If `gate.skip`, do **not** register that service in the test context, and have specs self-skip with `gate.reason`.
- **Never print a credential.** Pipe it straight into the env var the gate reads.
- Unit specs (schema compilation, identifiers, error translation) go in the `*-resource` package; specs that build a real `ServerContext` go in the db package that depends on it — the reverse is a devDependency cycle.
- **One namespace per spec file.** Export a `makeSuite(label)` from `tests/context.ts` that owns a `randomNamespace(`${prefix}_${label}`)` schema/database and its own `teardown()`, called from that file's `afterAll`. The process-global `registerCleanup`/`runCleanups()` queue is only safe in a package with a single spec file: Bun runs every spec file of a package in one process, so the first `afterAll` would drop the namespaces of the files still to come.
- Capture connections in a `finally`, so a spec asserting a *failed* boot does not leak the pool it opened. Close them *after* the namespace drop.
- Capability probes go at module scope as a top-level `await` — Bun decides `test` vs `test.skip` synchronously — and default to "not capable" on any error.
- Never reset module-scope declarations (migration registries, table declarations) inside a shared `boot()` helper; a spec that wants a clean slate calls `resetDeclarations(alias)` itself. Keep migration bodies at module scope so their checksums are stable.
- `expect(fn).not.toThrow()` treats a **returned** `Error` as thrown — assert the returned value instead.
- `<root>/.env.example` is the authoritative documentation of every variable. Add a new key there with a comment when you introduce a new gate.
- Per-package `package.json` script: `"test": "bun test ./tests"`; add `"./tests/**/*"` to `tsconfig.json` `exclude` and `@owlmeans/test-integration` + `@types/bun` to devDependencies. Long round-trips: bump timeout in a per-package `bunfig.toml`.
- Cover `.claude/skills/<pkg>/SKILL.md` and `README.md` cases first.
- Max 3-4 tests per method/function.

See `.claude/skills/testing-integration/SKILL.md` for the full pattern.
