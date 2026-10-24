---
name: testing
description: Where this package's unit specs and the real-context specs live.
metadata:
  purposes: test
  mentions: sync.spec.ts, criteria.spec.ts
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/postgres-resource — Tests

## Tests

`bun test ./tests` in the package — unit specs (schema compilation, identifiers, placeholder
resolution, criteria rendering, error translation, definition comparison against captured server
renderings), no gate, no service. Specs that build a real `ServerContext` live in
`@owlmeans/postgres` instead (`sync.spec.ts` proves a second boot plans nothing; `criteria.spec.ts`
answers each criteria the way the in-memory engine does): a devDependency here on its own
dependent is a cycle. See [[testing-integration]].
