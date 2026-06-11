---
applyTo: "packages/{basic-ids,context,config,error,flow,i18n,module,route,router,resource,socket,state,static-resource,client-route,client-config,client-context,client-resource,client-module,client-flow,client-socket,server-route,server-config,server-context,server-module,payment,api,api-config,api-config-client,api-config-server,web-router,web-db}/tests/**"
---

# Category A — Unit Tests (no mocks)

- Tests in `<your-package>/tests/*.spec.ts`. Use `bun:test` (`describe`, `test`, `expect`).
- Build a real context once in `tests/context.ts` and export a helper specs call. No mocks.
- Sibling packages are imported normally. If you feel the urge to mock one, you're in the wrong category — move to integration instead.
- Cover `.claude/skills/<pkg>/SKILL.md` and `README.md` cases first.
- Max 3-4 tests per method/function.
- Don't test utils, types, or context plumbing.
- Per-package `package.json` script: `"test": "bun test ./tests"`.

See `.claude/skills/testing-unit/SKILL.md` for the full pattern.
