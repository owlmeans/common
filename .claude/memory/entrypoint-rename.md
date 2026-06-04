---
name: entrypoint-rename
description: Module → Entrypoint rename: rationale, canonical packages, deprecated shims, marker interop, context method renames, and deprecation policy. Load when working with entrypoint/module packages or the rename migration.
metadata:
  type: project
---

The OwlMeans "module" concept (a registered, addressable server-handler and/or UI route) was renamed to **entrypoint** to eliminate collision with JS/TS "module" (ES module file), which routinely confused coding agents.

**Why:** `ctx.module(alias)`, `@owlmeans/module`, and `CommonModule` all share vocabulary with ES module semantics. Agents and humans regularly confused the two. "Entrypoint" has near-zero overlap in JS/TS vocabulary and reads correctly for both roles.

## New canonical packages (Phase 1 complete)

- `@owlmeans/entrypoint` — replaces `@owlmeans/module`
- `@owlmeans/server-entrypoint` — replaces `@owlmeans/server-module`
- `@owlmeans/client-entrypoint` — replaces `@owlmeans/client-module`

All three packages exist at version 0.1.2 under `packages/entrypoint/`, `packages/server-entrypoint/`, `packages/client-entrypoint/`.

## Deprecated reexport shims (kept indefinitely)

`@owlmeans/module`, `@owlmeans/server-module`, `@owlmeans/client-module` remain as thin shims re-exporting everything from the new canonical packages, with `@deprecated` JSDoc on old symbol names. Protects the `native` monorepo and any external consumers without changes.

## Marker interop rule

The factory in `@owlmeans/entrypoint` sets **both** `_entrypoint: true` and `_module: true` so objects interoperate across both new and old code. `isEntrypoint()` accepts either marker:
```ts
export const isEntrypoint = (obj: object): obj is CommonEntrypoint =>
  '_entrypoint' in obj || '_module' in obj
```

## Context method renames (in `packages/context/`)

| Old (deprecated, kept as delegating aliases) | New canonical |
|---|---|
| `ctx.module(alias)` | `ctx.entrypoint(alias)` |
| `ctx.modules()` | `ctx.entrypoints()` |
| `ctx.registerModule(ep)` | `ctx.registerEntrypoint(ep)` |
| `ctx.registerModules([ep])` | `ctx.registerEntrypoints([ep])` |
| `ctx.hasModule(alias)` | `ctx.hasEntrypoint(alias)` |
| `BasicModule` (interface) | `BasicEntrypoint` |

## GOTCHA — ESM bundler fields

`package.json` files contain a top-level `"module"` field and an `exports` `"module"` condition. These are bundler/tooling fields — **not** related to the concept. A find/replace on "module" must never touch `package.json` field keys. Only rename npm package `"name"` fields in new packages.

## Phase status

- **Phase 1** (common code migration): ✅ Complete. Build green, all consumers migrated.
- **Phase 2** (common docs/skills/metadata): ✅ Complete.
- **Phase 3** (internal monorepo): pending.
- **Phase 4** (viable-agent monorepo): pending.
- **Phase 5** (viable monorepo): pending.

**Why:** Phases 3–5 can run independently (shims keep old imports working). See `entrypoint.md` at repo root for full design.
