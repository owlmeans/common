---
node: entrypoints
scope: "packages/entrypoint/**, packages/server-entrypoint/**, packages/client-entrypoint/**, packages/context/**"
updated: 2026-08
---

# Entrypoints (module → entrypoint rename)

The "module" concept (registered, addressable server-handler and/or UI route) is named
**entrypoint** — "module" collided with ES-module vocabulary and routinely confused agents.
Full design: `entrypoint.md` at repo root. Route trees build on this model ([[routing]]).

## Facts

- Canonical packages: `@owlmeans/entrypoint`, `@owlmeans/server-entrypoint`,
  `@owlmeans/client-entrypoint`. The old `@owlmeans/*module` shim packages are DELETED from the
  repo (published shim versions remain on npm; external consumers must migrate).
- Context methods: `ctx.entrypoint(alias)`, `ctx.entrypoints()`, `ctx.registerEntrypoint(s)`,
  `ctx.hasEntrypoint`, `BasicEntrypoint` — old `ctx.module*` names kept as delegating deprecated
  aliases.
- Marker interop: the factory sets both `_entrypoint: true` and `_module: true`;
  `isEntrypoint()` accepts either marker.
- Rename status: common code + docs migrated; internal / viable-agent / viable phases pending
  (aliases keep old imports working).

## Gotchas

- `package.json` top-level `"module"` field and the `exports` `"module"` condition are bundler
  fields — a find/replace on "module" must never touch them.
- When migrating a shim import, also confirm `package.json` declares the canonical package and
  rebuild so `build/` matches src — a straggler once shipped with its built output importing
  undeclared shim deps, breaking clean installs.
