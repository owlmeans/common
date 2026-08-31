---
name: dependency-tree
description: Authoritative map of every @owlmeans/* package, its direct @owlmeans/* dependencies, the architecture layer it belongs to, and the topological build order. Auto-invoked when the agent needs to understand the dependency structure of the monorepo — for example, deciding which layer a new package belongs to, untangling a cyclic build, planning a refactor that crosses layers, or picking the right package to import from.
---

# Dependency tree — OwlMeans Common

The canonical reference is `tree.md` at the repo root. Read it directly when the task involves the monorepo's dependency structure or layer boundaries.

## When to read

- Adding a new `@owlmeans/*` package — confirm the right layer and which existing packages it can depend on.
- Adding a dependency to an existing package's `package.json` — verify the new edge does not violate layer rules or introduce a fresh cycle.
- Diagnosing a `tsc -b` or Bun build cycle.
- Picking the right import surface (e.g. should this code import from `client` or `web-client`?).
- Planning a refactor that may cross layer boundaries (e.g. moving code from `client-*` to `web-*`).

## Layers (high-level)

1. **Configuration** — `dep-config`
2. **Core foundations** — environment-agnostic primitives (`context`, `error`, `auth`, `route`, `module`, `resource`, `config`, `did`, `basic-*`, `i18n`, `state`, `socket`, `router`)
3. **Cross-cutting domain** — `flow`, `wled`, `payment`, `oidc`, `queue`
4. **Auth shared** — `auth-common`
5. **API & API config** — `api`, `api-config`, `api-config-client`, `api-config-server`
6. **Storage & infrastructure** — `mongo*`, `redis*`, `storage*`, `image-resource`, `static-resource`, `kluster`
7. **Server** — `server-*`
8. **Client (platform-agnostic)** — `client-*`
9. **Web** — `web-*`
10. **Native** — *external [owlmeans/native](https://github.com/owlmeans/native) monorepo*

Test-helper packages (`_tpl`, `test`, `test-auth`, `test-integration`, `test-ui`) are not framework packages and are out of scope for `tree.md`.

## Known cycles (SCCs)

Two strongly connected components exist in the monorepo. They are intentional — do not "fix" them by removing edges:

- **L5 SCC**: `{api, auth-common, client-context, client-module, client-route}`
- **L8 SCC**: `{server-auth, server-socket}`

## Maintenance

When a package's `@owlmeans/*` dependency set changes, update `tree.md`:

- Edit the per-package line in the layer section.
- Re-derive the topological levels if the change crosses a level boundary.
- Document any new cross-layer edge in the "Cross-layer notes" section.

To regenerate dep lists, iterate over each `packages/*/package.json` and merge `dependencies` + `peerDependencies` filtered to the `@owlmeans/*` namespace.
