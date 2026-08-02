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

## Deprecated reexport shims — REMOVED (2026-07-01)

`@owlmeans/module`, `@owlmeans/server-module`, `@owlmeans/client-module` (thin shims re-exporting the
`*-entrypoint` packages) were **deleted** from this repo — they had zero source/package.json consumers
across common, internal, viable, and viable-agent. **Caveat:** the separate `native` monorepo and any
external npm consumers that still import `@owlmeans/*-module` will break if they upgrade past the last
published shim version; they must migrate to `@owlmeans/*-entrypoint`. Published shim versions remain on
npm, so pinned installs are unaffected.

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
  - 2026-06-05 follow-up: four packages were stragglers still importing the deprecated shims while their `package.json` already declared only the canonical deps — `client` (`src/utils/route.tsx`, `src/helper.tsx`), `client-auth` (`dispatcher/component.tsx`), `mui-panel` & `web-panel` (`auth/plugins/basic-ed25519.tsx`, `components/link.tsx`). The `client` case shipped a broken published `0.1.3`: its built `route.js` `import`ed `@owlmeans/client-module`/`@owlmeans/module` at runtime (undeclared deps), breaking any clean install (e.g. the viable-agent template Rollup build). All migrated to `@owlmeans/client-entrypoint`/`@owlmeans/entrypoint` and rebuilt. **Republish required** so consumers stop pulling the broken `0.1.3`. Lesson: when migrating a shim import, also confirm `package.json` declares the canonical pkg and rebuild so `build/` matches src.
- **Phase 2** (common docs/skills/metadata): ✅ Complete.
- **Phase 3** (internal monorepo): pending.
- **Phase 4** (viable-agent monorepo): pending.
- **Phase 5** (viable monorepo): pending.

**Why:** Phases 3–5 can run independently (shims keep old imports working). See `entrypoint.md` at repo root for full design.
