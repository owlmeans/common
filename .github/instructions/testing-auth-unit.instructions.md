---
applyTo: "packages/{auth,auth-common,basic-keys,basic-envelope,did,client-auth,client-did,server-auth,oidc,server-oidc-rp,server-oidc-provider,web-oidc-rp,web-oidc-provider,wled,client-payment}/tests/**"
---

# Category B — Auth Unit Tests

- Tests in `<your-package>/tests/*.spec.ts`. Use `bun:test`.
- The **only** mocks allowed: `@owlmeans/test-auth` helpers (`makeFixtureKeyPair`, `makeMemoryTrustedResource`, `makeMockGuard`, `withAuth`, `signMockEnvelope`, `makeBearer`).
- Never roll a new auth mock in a per-package `tests/`. Add it to `@owlmeans/test-auth` and update its skill instead.
- Use deterministic seeds: `makeFixtureKeyPair('alice')` keeps signatures stable.
- Cover `.claude/skills/<pkg>/SKILL.md` and `README.md` cases first.
- Max 3-4 tests per method/function.
- Don't test utils, types, or context plumbing.
- Per-package `package.json` script: `"test": "bun test ./tests"`.

For the protocol reference (Ed25519 path, OIDC path, types, errors, mocking points), see `.claude/skills/auth-protocol/SKILL.md`. For helper specifics, see `.claude/skills/testing-auth-unit/SKILL.md`.
