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

1. **Configuration & tooling** — `dep-config`, `agent-skills`, `create-app`
2. **Core foundations** — environment-agnostic primitives (`context`, `error`, `auth`, `route`, `router`, `entrypoint`, `resource`, `config`, `did`, `basic-*`, `i18n`, `state`, `socket`)
3. **Cross-cutting domain** — `flow`, `oidc`, `iam`, `payment`, `wled`, `consent`, `mailer`, `auth-otp`, `llm-common`, `llm`, `agent-common`, `agent`, and the abstract `queue` contract (its `redis-queue` driver sits in the storage layer, its `server-job` / `client-job` transports in the server and client layers)
4. **Auth shared** — `auth-common`
5. **API & API config** — `api`, `api-config`, `api-config-client`, `api-config-server`
6. **Storage & infrastructure** — `mongo*`, `redis*`, `postgres*`, `storage*`, `image-resource`, `static-resource`, `kluster`, plus the drivers behind the abstract contracts: `redis-queue`, `mailer-smtp`, `server-mailer-mailgun`
7. **Server** — `server-*`, including the queue's server-side transport `server-job`
8. **Client (platform-agnostic)** — `client-*`, including the queue's client-side transport `client-job`
9. **Web** — `web-*`, the Material-UI variants `mui-panel` / `mui-oidc-rp`, and the Astro integration `astro`
10. **Native** — *external [owlmeans/native](https://github.com/owlmeans/native) monorepo*

A prefix is not proof of a layer. `client-iam` depends on `web-client` and `web-oidc-rp`, so it is browser-only; check `tree.md` before assuming a `client-*` package is safe for React Native. `client-auth` depends on `web-flow`, so it too pulls the web layer in.

`tree.md` covers the 96 framework packages. Test-helper packages (`_tpl`, `test`, `test-auth`, `test-integration`, `test-ui`) are not framework packages and are out of scope for it.

## Families that span layers

Two concerns are split across layers on purpose. Reach for the member that matches the layer you are in, never the one whose name reads closest:

| Family | Contract (layer 3) | Driver (layer 6) | Server transport (layer 7) | Client transport (layer 8) |
|---|---|---|---|---|
| Jobs / queues | `queue` — job/queue contracts, transport, bridge, and the worker surface (`servedJobs`, `entrypointProcessor`, `queueWorkerMiddleware`) | `redis-queue` | `server-job` — job entrypoint declaration and serving (`jobEntrypointAliases`, `declareJobEntrypoints`, `serveJobEntrypoints`), the list/get/cancel/watch actions, and owner/resource utils | `client-job` — job helper, hooks and feed |
| Mail | `mailer` — transport contract and the console/dev transport | `mailer-smtp`, `server-mailer-mailgun` | — | — |

The LLM/agent stack has no such split — every member is environment-agnostic and sits in layer 3. Its order is `llm-common` → `llm` (models, provider plugins, execution service) → `agent-common` (graph contracts, on `flow`) → `agent` (the runtime graph). A server package that runs a graph depends on `agent`; it does not re-implement one.

## Known cycles (SCCs)

Two strongly connected components exist in the monorepo. They are intentional — do not "fix" them by removing edges. The numbers are topological **build** levels in `tree.md`'s numbering, where L0 is the set with no `@owlmeans/*` dependencies — not the architecture layers above:

- **Build level 5**: `{api, auth-common, client-context, client-entrypoint, client-route}`
- **Build level 8**: `{server-auth, server-socket}`

Recompute them rather than trusting a copy: merge each package's `dependencies` + `peerDependencies` restricted to `@owlmeans/*` and run Tarjan over the result.

## Maintenance

When a package's `@owlmeans/*` dependency set changes, update `tree.md`:

- Edit the per-package line in the layer section.
- Re-derive the topological levels if the change crosses a level boundary.
- Document any new cross-layer edge in the "Cross-layer notes" section.

To regenerate dep lists, iterate over each `packages/*/package.json` and merge `dependencies` + `peerDependencies` filtered to the `@owlmeans/*` namespace, deduplicated and with self-references stripped. Recompute the SCC list from the same data — never copy it forward.
