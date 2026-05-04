---
description: "Authoritative map of every @owlmeans/* package, its direct @owlmeans/* dependencies, the architecture layer it belongs to, and the topological build order. Read tree.md whenever you need to understand the dependency structure of the monorepo."
applyTo: "packages/**/package.json, tree.md"
---

# Dependency tree — OwlMeans Common

The canonical reference is [`tree.md`](../../tree.md) at the repo root. Read it directly when the task involves the monorepo's dependency structure or layer boundaries.

## When to read

- Adding a new `@owlmeans/*` package — confirm the right layer and which existing packages it can depend on.
- Adding a dependency to an existing package's `package.json` — verify the new edge does not violate layer rules or introduce a fresh cycle.
- Diagnosing a `tsc -b` or Bun build cycle.
- Picking the right import surface (e.g. should this code import from `client` or `web-client`?).
- Planning a refactor that may cross layer boundaries.

## Layers (high-level)

1. **Configuration** — `dep-config`
2. **Core foundations** — `context`, `error`, `auth`, `route`, `module`, `resource`, `config`, `did`, `basic-*`, `i18n`, `state`, `socket`, `router`
3. **Cross-cutting domain** — `flow`, `wled`, `payment`, `oidc`, `queue`
4. **Auth shared** — `auth-common`
5. **API & API config** — `api`, `api-config`, `api-config-*`
6. **Storage & infrastructure** — `mongo*`, `redis*`, `storage*`, `image-resource`, `static-resource`, `kluster`
7. **Server** — `server-*`
8. **Client (platform-agnostic)** — `client-*`
9. **Web** — `web-*`
10. **Native** — *external [owlmeans/native](https://github.com/owlmeans/native) monorepo*

Test-helper packages (`_tpl`, `test`, `test-auth`, `test-integration`, `test-ui`) are not framework packages and are out of scope.

## Known cycles (SCCs)

- **L5 SCC**: `{api, auth-common, client-context, client-module, client-route}`
- **L8 SCC**: `{server-auth, server-socket}`

These are intentional — do not remove edges to "break" them.

## Maintenance

Update `tree.md` whenever a `packages/*/package.json` changes its `@owlmeans/*` `dependencies` / `peerDependencies`, when a package is added or removed, or when a new cross-layer edge is introduced.
