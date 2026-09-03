---
node: entrypoints
scope: "packages/entrypoint/**, packages/server-entrypoint/**, packages/client-entrypoint/**, packages/route/**, packages/server-route/**, packages/client-route/**, packages/context/**"
updated: 2026-09
---

# Entrypoints

A registered, addressable server-handler and/or UI route is an **entrypoint** — "module" collides
with ES-module vocabulary and routinely confuses agents, so it is never the name of this concept.
Full design: `entrypoint.md` at repo root. Route trees build on this model ([[routing]]); the
registry that holds them is [[context]].

## Facts

- Canonical packages: `@owlmeans/entrypoint`, `@owlmeans/server-entrypoint`,
  `@owlmeans/client-entrypoint`. There are no `@owlmeans/*module` packages in the repo (published
  shim versions remain on npm; external consumers must migrate).
- Context API: `ctx.entrypoint(alias)`, `ctx.entrypoints()`, `ctx.registerEntrypoint(ep)`,
  `ctx.registerEntrypoints(eps)`, `ctx.hasEntrypoint(alias)`, `BasicEntrypoint`. These are the only
  names — there is no `ctx.module*` alias.
- Marker: the factory sets `_entrypoint: true` and nothing else; `isEntrypoint()` tests exactly
  that one marker.
- A `RouteDeclaration` is plain immutable data that `RouteModel` only wraps. Its `path` is the
  SEGMENT the route contributes under its parent and is never rewritten — there is no resolution
  step and no resolved flag to check.
- Every address question is therefore computed on demand from the declaration plus the asking
  context, which is what lets one declaration answer differently in a server and in a client:
  `segment()`, `path()`, `mount()` (base + path), `service()`, `address()`, `isLocal()`,
  `parent()`, `getGuards()`, `getGates()`. Guard and gate inheritance is walked afresh on every
  call and never memoised, so a guard added to an ancestor later still counts.
- Three verbs address an entrypoint: `call(req?)` resolves to the VALUE and throws the reply's
  error, `invoke(req?)` resolves to `{ value, outcome }`, and `url(req?, { absolute? })` builds the
  URL string. Underneath they are `apiInvoke(ref, opts?)` and `entrypointUrl(ref, req, opts?)`.
- The registry is flat and keyed by alias, so registering an alias twice replaces the earlier
  entrypoint — spread lists resolve to the last declaration ([[context]]).

## Invariants

- `elevate(list, alias, …)` is idempotent: it replaces the element carrying that alias in place, so
  re-elevating is legal and no force flag exists. The guards it brings are UNIONED with the
  declared ones — elevating adds authorization, it never swaps it.
- Client-side callability is an explicit opt-in. A backend entrypoint becomes callable from client
  code only through the client `elevate` — imported as `celevate` where server and client
  elevations sit in one file.
- An entrypoint that RENDERS a screen is addressed by URL and never over the wire: `call()` and
  `invoke()` on one throw, naming `url()`.
- How a call travels is the route protocol's business, never the caller's. A service registered
  under `transportAlias(protocol)` (`transport:<protocol>`) implementing
  `EntrypointTransport { protocol, handle }` takes the call; HTTP carries it when no such service
  is registered. Consumers write `ep.call(...)` either way and learn nothing about the carrier.

## Gotchas

- `package.json` top-level `"module"` field and the `exports` `"module"` condition are bundler
  fields — a find/replace on "module" must never touch them.
- When an import is repointed at another package, confirm `package.json` declares that package and
  rebuild so `build/` matches src — built output importing an undeclared dep breaks clean installs
  while the workspace still resolves it locally.
