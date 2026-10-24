---
name: testing
description: The package's specs, the POSTGRES_URL gate, throwaway schemas and fault injection by trigger.
metadata:
  purposes: test
  mentions: POSTGRES_URL, gateHelper, makeSuite
---

# @owlmeans/planning-postgres — Testing

## Testing

`bun test ./tests` — `schema.spec.ts`, `sql.spec.ts` and `created-by.spec.ts` (the statements
around the `createdBy` column ownership checks read) need no database; `conformance.spec.ts`
(the `@owlmeans/server-planning/conformance` cases, read from that package's BUILT output — a new
case runs here only after `server-planning` is rebuilt), `fold.spec.ts`, `bus.spec.ts` and
`sync.spec.ts` are gated on `POSTGRES_URL` (`gateHelper.postgresGate()`) and skip cleanly without
it. Each spec file owns a throwaway schema (`makeSuite`); a fault is injected with a real trigger,
never a mock.
