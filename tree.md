# OwlMeans Common — Package Dependency Tree

This is the canonical, machine-friendly map of every published `@owlmeans/*` package and its direct dependencies on other `@owlmeans/*` packages. Read it whenever you need to understand the dependency structure of the monorepo: build order, layer boundaries, where to plug a new package, or which package to import from.

**Scope.** All ~75 framework packages are included. Test-helper packages (`_tpl`, `test`, `test-auth`, `test-integration`, `test-ui`) are intentionally excluded — they exist to support the testing infrastructure, not to ship to consumers.

**Reading the entries.** Each line `- pkg → dep1, dep2` lists `pkg`'s direct `@owlmeans/*` dependencies (combined `dependencies` + `peerDependencies`, deduplicated, self-references stripped). Non-`@owlmeans/*` deps (React, MUI, Fastify, AJV, axios, etc.) are out of scope here — see each package's own `package.json`.

**The "Quadra" pattern.** Every framework concern is split into up to four layers: **Core** (environment-agnostic) → **Server** (Node/Bun) and **Client** (platform-agnostic React) → **Web** (browser-specific React). React Native lives in a separate [owlmeans/native](https://github.com/owlmeans/native) monorepo and consumes packages from here. The architecture layers below mirror this pattern, with extra layers for shared cross-cutting concerns (auth-common, api-config, infrastructure, domain).

---

## Architecture layers (index)

1. [Configuration](#1-configuration) — shared TypeScript configs
2. [Core foundations](#2-core-foundations) — environment-agnostic primitives
3. [Cross-cutting domain](#3-cross-cutting-domain) — flow, payment, oidc, queue, llm, agent, wled
4. [Auth shared](#4-auth-shared) — `auth-common`
5. [API & API config](#5-api--api-config) — HTTP client and runtime config plumbing
6. [Storage & infrastructure](#6-storage--infrastructure) — Mongo, Postgres, Redis, S3, Kubernetes, file resources
7. [Server packages](#7-server-packages) — backend (Fastify, Node/Bun)
8. [Client packages (platform-agnostic)](#8-client-packages-platform-agnostic) — React without DOM/Native specifics
9. [Web packages](#9-web-packages) — browser/React DOM
10. [Native packages](#10-native-packages-external-monorepo) — *external monorepo*

---

## 1. Configuration

Shared TypeScript build configs. Has no runtime code.

- [`dep-config`](packages/dep-config) → *(no `@owlmeans/*` deps)*

## 2. Core foundations

Environment-agnostic primitives. Everything else builds on this layer. Within this layer, the entries are listed in dependency order (lower-level first).

- [`context`](packages/context) → *(no `@owlmeans/*` deps)*
- [`i18n`](packages/i18n) → *(no `@owlmeans/*` deps)*
- [`basic-ids`](packages/basic-ids) → *(no `@owlmeans/*` deps)*
- [`error`](packages/error) → `i18n`
- [`route`](packages/route) → `context`
- [`router`](packages/router) → `context` *(routing plugin host: `RouterService` registry + cascade selection + neutral route IR + pure matcher)*
- [`auth`](packages/auth) → `error`
- [`resource`](packages/resource) → `context`, `error`
- [`basic-keys`](packages/basic-keys) → `auth`
- [`entrypoint`](packages/entrypoint) → `auth`, `context`, `route`
- [`state`](packages/state) → `context`, `resource`
- [`socket`](packages/socket) → `auth`, `basic-ids`, `error`
- [`basic-envelope`](packages/basic-envelope) → `basic-keys`
- [`did`](packages/did) → `auth`, `basic-keys`, `error`, `i18n`, `resource`
- [`config`](packages/config) → `auth`, `context`, `error`, `resource`, `route`

## 3. Cross-cutting domain

Domain-level features that are themselves environment-agnostic but sit on top of multiple core primitives. Server, client, and web layers consume these directly.

- [`queue`](packages/queue) → *(no `@owlmeans/*` deps — abstract interface)*
- [`llm-common`](packages/llm-common) → *(no `@owlmeans/*` deps — serializable LLM/execution contracts)*
- [`llm`](packages/llm) → `basic-ids`, `context`, `error`, `llm-common`
- [`agent-common`](packages/agent-common) → `error`, `flow`, `llm-common`, `resource`
- [`agent`](packages/agent) → `agent-common`, `basic-ids`, `context`, `error`, `flow`, `llm`, `llm-common`
- [`flow`](packages/flow) → `auth`, `config`, `error`, `i18n`, `resource`
- [`wled`](packages/wled) → `auth`, `entrypoint`, `route`
- [`payment`](packages/payment) → `auth`, `basic-envelope`, `config`, `context`, `error`, `i18n`, `entrypoint`, `resource`, `route`
- [`oidc`](packages/oidc) → `auth`, `auth-common`, `basic-envelope`, `config`, `context`, `entrypoint`, `resource`, `route`

## 4. Auth shared

Sits between core and the server/client auth implementations. References both server-style and client-style entrypoint surfaces.

- [`auth-common`](packages/auth-common) → `auth`, `basic-ids`, `basic-keys`, `client-entrypoint`, `context`, `entrypoint`, `resource`, `route`

> **Note.** `auth-common` references `client-entrypoint` for typed entrypoint helpers shared by both server and client auth flows. This is a deliberate cross-layer dependency — see [Cross-layer notes](#cross-layer-notes).

## 5. API & API config

HTTP client and the runtime API-config endpoint that lets clients discover backend services.

- [`api`](packages/api) → `auth-common`, `client-config`, `client-route`, `config`, `context`, `error`, `entrypoint`, `route`
- [`api-config`](packages/api-config) → `config`, `entrypoint`, `route`
- [`api-config-client`](packages/api-config-client) → `api-config`, `client-context`, `client-entrypoint`, `context`
- [`api-config-server`](packages/api-config-server) → `api-config`, `server-api`, `server-context`, `server-entrypoint`

## 6. Storage & infrastructure

External-system integrations: Mongo, Postgres, Redis, S3-compatible object storage, Kubernetes. Most of these depend on `server-context` because they are server-only services.

- [`storage-common`](packages/storage-common) → `auth`, `error`
- [`static-resource`](packages/static-resource) → `context`, `error`, `resource`
- [`storage-resource`](packages/storage-resource) → `context`, `error`, `resource`, `server-context`, `storage-common`
- [`image-resource`](packages/image-resource) → `storage-resource`
- [`mongo-resource`](packages/mongo-resource) → `context`, `resource`, `server-context`
- [`mongo`](packages/mongo) → `basic-keys`, `context`, `mongo-resource`, `server-context`
- [`redis-resource`](packages/redis-resource) → `basic-ids`, `context`, `resource`, `server-context`
- [`redis`](packages/redis) → `context`, `redis-resource`, `resource`, `server-context`
- [`postgres-resource`](packages/postgres-resource) → `basic-ids`, `context`, `resource`, `server-context`
- [`postgres`](packages/postgres) → `basic-keys`, `context`, `postgres-resource`, `resource`, `server-context`
- [`kluster`](packages/kluster) → `config`, `context`, `server-config`, `server-context`

## 7. Server packages

Node/Bun backend implementations built on Fastify. Listed in dependency order.

- [`server-route`](packages/server-route) → `context`, `route`
- [`server-config`](packages/server-config) → `config`, `server-route`
- [`server-context`](packages/server-context) → `client-config`, `config`, `context`, `route`, `server-config`
- [`server-entrypoint`](packages/server-entrypoint) → `context`, `entrypoint`, `route`, `server-route`
- [`server-api`](packages/server-api) → `api`, `auth`, `auth-common`, `context`, `error`, `entrypoint`, `route`, `server-context`, `server-entrypoint`
- [`server-wl`](packages/server-wl) → `context`, `server-api`, `server-context`, `server-entrypoint`, `wled`
- [`server-oidc-provider`](packages/server-oidc-provider) → `client-entrypoint`, `config`, `context`, `oidc`, `route`, `server-api`, `server-context`
- [`server-socket`](packages/server-socket) → `auth`, `basic-envelope`, `context`, `entrypoint`, `server-api`, `server-auth`, `server-context`, `server-entrypoint`, `socket`
- [`server-auth`](packages/server-auth) → `api`, `api-config-server`, `auth`, `auth-common`, `basic-envelope`, `basic-ids`, `basic-keys`, `client-config`, `client-entrypoint`, `config`, `context`, `entrypoint`, `kluster`, `redis-resource`, `resource`, `route`, `server-api`, `server-context`, `server-entrypoint`, `server-route`, `server-socket`, `socket`, `static-resource`
- [`server-auth-identity`](packages/server-auth-identity) → `auth`, `basic-ids`, `context`, `mongo-resource`, `oidc`, `resource`, `server-context`
- [`server-oidc-rp`](packages/server-oidc-rp) → `auth`, `auth-common`, `basic-envelope`, `client-entrypoint`, `config`, `context`, `did`, `entrypoint`, `oidc`, `resource`, `route`, `server-api`, `server-auth`, `server-context`, `server-entrypoint`
- [`server-job`](packages/server-job) → `auth`, `auth-common`, `context`, `entrypoint`, `queue`, `resource`, `route`, `server-api`, `server-context`, `server-entrypoint`, `server-socket`, `socket`
- [`server-app`](packages/server-app) → `api`, `client-config`, `client-entrypoint`, `config`, `context`, `entrypoint`, `kluster`, `route`, `server-api`, `server-auth`, `server-context`, `server-entrypoint`, `server-route`, `server-socket`, `static-resource`

> **Note.** Several server packages depend on `client-config` / `client-entrypoint` for the shared entrypoint/config types that the server uses to mirror the client surface — see [Cross-layer notes](#cross-layer-notes).

## 8. Client packages (platform-agnostic)

React-based, but no DOM or React Native specifics. Web and Native packages consume these. Listed in dependency order.

- [`client-wl`](packages/client-wl) → *(no `@owlmeans/*` deps — placeholder)*
- [`client-config`](packages/client-config) → `config`
- [`client-context`](packages/client-context) → `api`, `client-config`, `config`, `context`, `i18n`, `route`
- [`client-route`](packages/client-route) → `client-context`, `route`
- [`client-resource`](packages/client-resource) → `client-context`, `context`, `resource`
- [`client-entrypoint`](packages/client-entrypoint) → `api`, `client-config`, `client-context`, `client-route`, `config`, `context`, `entrypoint`, `error`, `route`
- [`client-i18n`](packages/client-i18n) → `client`, `client-context`, `i18n`
- [`client`](packages/client) → `auth`, `client-context`, `client-entrypoint`, `client-resource`, `config`, `context`, `error`, `entrypoint`, `resource`, `router`, `state`
- [`client-did`](packages/client-did) → `auth`, `client`, `client-context`, `client-resource`, `context`, `did`, `state`
- [`client-flow`](packages/client-flow) → `auth-common`, `client`, `client-context`, `client-entrypoint`, `client-resource`, `config`, `context`, `error`, `flow`, `entrypoint`, `resource`, `route`
- [`client-socket`](packages/client-socket) → `auth`, `basic-envelope`, `client`, `client-context`, `client-entrypoint`, `context`, `entrypoint`, `socket`
- [`client-payment`](packages/client-payment) → `client-auth`, `context`, `payment`
- [`client-panel`](packages/client-panel) → `auth`, `client`, `client-auth`, `client-i18n`, `client-entrypoint`, `client-route`, `error`, `i18n`, `entrypoint`, `router`
- [`client-auth`](packages/client-auth) → `auth`, `auth-common`, `basic-envelope`, `basic-keys`, `client`, `client-context`, `client-flow`, `client-entrypoint`, `client-resource`, `client-socket`, `context`, `did`, `error`, `flow`, `entrypoint`, `resource`, `socket`, `web-flow`

- [`client-job`](packages/client-job) → `client`, `client-auth`, `client-context`, `client-entrypoint`, `context`, `queue`, `resource`, `socket`, `state`

> **Note.** `client-auth` declares `web-flow` as a peer dependency so that web apps can wire web-specific flow handling into the client auth manager. See [Cross-layer notes](#cross-layer-notes).

## 9. Web packages

Browser-specific React (DOM, Material-UI, IndexedDB). Routing defaults to the OwlMeans in-browser plugin (`web-router`); react-router v7 is opt-in via `web-router-react-router`. Listed in dependency order.

- [`web-router`](packages/web-router) → `context`, `router` *(the default OwlMeans in-browser routing plugin: history + matcher-backed provider/outlet/hooks)*
- [`web-router-react-router`](packages/web-router-react-router) → `context`, `router` *(opt-in react-router v7 plugin, extracted from the former web-router; register via `appendReactRouter`)*
- [`web-db`](packages/web-db) → `client-context`, `client-resource`, `context`
- [`web-client`](packages/web-client) → `auth`, `auth-common`, `client`, `client-auth`, `client-context`, `client-i18n`, `client-entrypoint`, `client-resource`, `client-route`, `config`, `context`, `error`, `i18n`, `route`, `web-db`, `web-router`
- [`web-flow`](packages/web-flow) → `client`, `client-context`, `client-flow`, `client-entrypoint`, `client-resource`, `context`, `error`, `flow`
- [`web-oidc-provider`](packages/web-oidc-provider) → `auth`, `client-flow`, `oidc`, `resource`, `web-client`
- [`web-oidc-rp`](packages/web-oidc-rp) → `auth`, `basic-envelope`, `client`, `client-auth`, `client-flow`, `client-i18n`, `context`, `entrypoint`, `flow`, `oidc`, `resource`, `web-client`, `web-flow`
- [`web-wl`](packages/web-wl) → `client`, `client-entrypoint`, `context`, `wled`
- [`web-panel`](packages/web-panel) → `api-config-client`, `auth`, `auth-common`, `basic-envelope`, `client`, `client-auth`, `client-config`, `client-context`, `client-flow`, `client-i18n`, `client-entrypoint`, `client-panel`, `client-route`, `config`, `context`, `entrypoint`, `error`, `flow`, `i18n`, `route`, `web-client`, `web-db`, `web-flow`, `web-router`

## 10. Native packages (external monorepo)

React Native implementations. **Not in this repo** — see [owlmeans/native](https://github.com/owlmeans/native).

- `@owlmeans/native-client` — RN entry point (analogue of `web-client`)
- `@owlmeans/native-router` — RN router service
- `@owlmeans/native-panel` — RN UI panels (analogue of `web-panel`)
- `@owlmeans/native-db` — RN local storage (analogue of `web-db`)

These consume the platform-agnostic [client packages](#8-client-packages-platform-agnostic) from this repo and never the [web packages](#9-web-packages).

---

## Cross-layer notes

A handful of dependencies cross the obvious layer boundaries. They are intentional — record them here so they are not "fixed" by mistake:

- **Strongly connected component (SCC) at level 5: `{api, auth-common, client-context, client-entrypoint, client-route}`.** These five packages have mutual `dependencies` references (e.g. `client-context → api → client-route → client-context`). They form a single connected unit and are compiled together. Treat them as one logical layer when reasoning about build order; reaching for one of them generally pulls the others in.
- **Strongly connected component at level 8: `{server-auth, server-socket}`.** `server-auth` declares `server-socket` as a dep, and `server-socket` declares `server-auth` as a dep. Same caveat as the level-5 SCC.
- **`auth-common` → `client-entrypoint`.** `auth-common` exposes typed helpers for the shared auth entrypoints in a form the client uses; the dependency surfaces the client-side helper types in the shared layer. (Part of the level-5 SCC above.)
- **Several server packages → `client-config` / `client-entrypoint`.** The server mirrors the client's entrypoint/config types so that route declarations and config payloads stay in sync across the wire. Server packages do not pull in any DOM or React.
- **`client-auth` → `web-flow`.** Lets web applications wire `web-flow` into the platform-agnostic client auth manager. Native applications use a native flow analogue from the [`native` monorepo](https://github.com/owlmeans/native).

If you add a new cross-layer dependency, document it here and explain why.

## Build order (topological levels)

Lower levels are compiled before higher ones. `bun run build` orchestrates this via workspace dependency resolution; you usually do not need to think about it. Useful when you suspect a build cycle or are reasoning about partial builds. SCCs (see [Cross-layer notes](#cross-layer-notes)) are listed as a single `{a | b | …}` group.

- **L0** (no `@owlmeans/*` deps): `basic-ids`, `client-wl`, `context`, `dep-config`, `i18n`, `queue`
- **L1**: `error`, `route`, `router`
- **L2**: `auth`, `resource`, `server-route`, `web-router`, `web-router-react-router`
- **L3**: `basic-keys`, `config`, `entrypoint`, `socket`, `state`, `static-resource`, `storage-common`
- **L4**: `api-config`, `basic-envelope`, `client-config`, `did`, `flow`, `server-config`, `server-entrypoint`, `wled`
- **L5**: `payment`, `server-context`, `{api | auth-common | client-context | client-entrypoint | client-route}`
- **L6**: `api-config-client`, `client-resource`, `kluster`, `mongo-resource`, `oidc`, `postgres-resource`, `redis-resource`, `server-api`, `storage-resource`
- **L7**: `api-config-server`, `client`, `image-resource`, `mongo`, `postgres`, `redis`, `server-oidc-provider`, `server-wl`, `web-db`
- **L8**: `client-did`, `client-flow`, `client-i18n`, `client-socket`, `web-wl`, `{server-auth | server-socket}`
- **L9**: `server-app`, `server-job`, `server-oidc-rp`, `web-flow`
- **L10**: `client-auth`
- **L11**: `client-job`, `client-panel`, `client-payment`, `web-client`
- **L12**: `web-oidc-provider`, `web-oidc-rp`, `web-panel`

> Levels are computed from `dependencies` + `peerDependencies` over the `@owlmeans/*` namespace, with strongly connected components collapsed. They are advisory — the authoritative build order is whatever Bun resolves at install time.

---

## Visual dependency map

### Architecture layers (top = highest-level, bottom = foundations)

Dependencies flow downward: every package can only import from the layers below it (cross-layer exceptions are documented in [Cross-layer notes](#cross-layer-notes)).

```
 ╔══════════════════════════════════════════════════════════════════════════════╗
 ║  WEB  (browser-specific React / DOM / Material-UI)                L11–L12   ║
 ║                                                                              ║
 ║  web-panel        web-client      web-flow        web-router                ║
 ║  web-oidc-rp      web-oidc-provider               web-wl   web-db           ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CLIENT  (platform-agnostic React — web + React Native)           L8–L11    ║
 ║                                                                              ║
 ║  client-auth      client-panel    client-flow      client                   ║
 ║  client-socket    client-i18n     client-did       client-payment            ║
 ║  client-entrypoint ─┐                                                        ║
 ║  client-context     ├─ SCC (mutual refs)                                     ║
 ║  client-route     ──┘                             client-resource             ║
 ║  client-config    client-wl                                                  ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  SERVER  (Node / Bun / Fastify)                                   L7–L9     ║
 ║                                                                              ║
 ║  server-app       server-auth ─┐                  server-api                ║
 ║  server-oidc-rp   server-socket┘ SCC              server-oidc-provider      ║
 ║  server-entrypoint  server-route  server-context   server-config             ║
 ║  server-wl                                                                   ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  STORAGE & INFRASTRUCTURE                                         L6–L7     ║
 ║                                                                              ║
 ║  mongo            mongo-resource  redis            redis-resource            ║
 ║  storage-resource image-resource  storage-common   static-resource           ║
 ║  kluster          postgres        postgres-resource                          ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  API & API-CONFIG  (HTTP client + runtime config plumbing)         L5–L6    ║
 ║                                                                              ║
 ║  api              api-config      api-config-client  api-config-server       ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  AUTH SHARED                                                          L5    ║
 ║                                                                              ║
 ║  auth-common  (bridges core auth ↔ server + client entrypoint surfaces)      ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CROSS-CUTTING DOMAIN  (environment-agnostic domain logic)        L4–L5     ║
 ║                                                                              ║
 ║  flow             oidc            payment          wled            queue     ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CORE FOUNDATIONS  (environment-agnostic primitives)              L0–L4     ║
 ║                                                                              ║
 ║  context          error           auth             config          i18n      ║
 ║  route            router          entrypoint       resource        state     ║
 ║  socket           did             basic-keys       basic-envelope            ║
 ║  basic-ids        static-resource storage-common                            ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CONFIGURATION                                                        L0    ║
 ║                                                                              ║
 ║  dep-config  (TypeScript configs only — no runtime code)                     ║
 ╚══════════════════════════════════════════════════════════════════════════════╝
```

### Build pyramid (L0 compiles first, L12 last)

```
  L12  ██ web-oidc-provider  web-oidc-rp  web-panel
  L11  ███ client-panel  client-payment  web-client
  L10  █ client-auth
   L9  ███ server-app  server-oidc-rp  web-flow
   L8  ██████ client-did  client-flow  client-i18n  client-socket  web-wl
        ████ {server-auth ↔ server-socket}
   L7  ████████ api-config-server  client  image-resource  mongo  postgres
                redis  server-oidc-provider  server-wl  web-db
   L6  ████████ api-config-client  client-resource  kluster  mongo-resource
                oidc  postgres-resource  redis-resource  server-api  storage-resource
   L5  ████████ payment  server-context
        █████████████ {api ↔ auth-common ↔ client-context ↔ client-entrypoint ↔ client-route}
   L4  ████████ api-config  basic-envelope  client-config  did  flow
                server-config  server-entrypoint  wled
   L3  ████████ basic-keys  config  entrypoint  socket  state  static-resource  storage-common
   L2  ████ auth  resource  server-route  web-router
   L1  ███ error  route  router
   L0  ██████ basic-ids  client-wl  context  dep-config  i18n  queue
        ▲
        └── no @owlmeans/* deps — compile first
```

### Flagship entry-point trees (key paths, simplified)

`server-app` is the typical backend entry point. `web-panel` is the typical frontend entry point. Both pull in much of the framework transitively.

```
server-app
├── server-auth ↔ server-socket  (L8 SCC — mutual ref)
│   ├── server-api
│   │   └── ╌╌ {api | auth-common | client-context | client-entrypoint | client-route}  (L5 SCC)
│   │             └── client-config ← config ← auth ← error ← i18n
│   ├── basic-keys ← auth ← error
│   ├── redis-resource ← server-context ← server-config ← config
│   └── socket ← auth
├── server-api  (see above)
├── server-entrypoint ← entrypoint ← auth
├── server-route  ← route ← context
├── server-context ← server-config ← config
├── kluster ← server-context
└── static-resource ← resource ← context

web-panel
├── web-client  (L11)
│   ├── client-auth  (L10)
│   │   ├── client  (L7)
│   │   │   ├── ╌╌ {client-entrypoint | client-context | ...}  (L5 SCC)
│   │   │   ├── router ← context
│   │   │   └── state ← resource ← context
│   │   ├── client-flow  (L8)
│   │   │   └── flow ← config ← auth ← error ← i18n
│   │   ├── client-socket ← socket ← auth
│   │   └── did ← basic-keys ← auth
│   ├── web-db ← client-resource ← client-context
│   └── web-router ← router ← context
├── web-flow  (L9) ← client-flow ← flow
├── client-panel  (L11) ← client-auth  client-i18n  router
├── client-i18n  (L8) ← i18n
└── api-config-client  (L6) ← api-config ← config
```

> `←` means "depends on". `↔` means mutual dependency (SCC). `╌╌` marks a node whose subtree is shown elsewhere in the same diagram.

---

## Maintenance

Update this file when:

- A package is added or removed.
- A package's `@owlmeans/*` dependency set changes (added, removed, or moved between `dependencies` / `peerDependencies`).
- A new cross-layer dependency is introduced — also explain why in [Cross-layer notes](#cross-layer-notes).

To regenerate the per-package dep lists, iterate over each `packages/*/package.json` and merge `dependencies` + `peerDependencies` filtered to the `@owlmeans/*` namespace.
