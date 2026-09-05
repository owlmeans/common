# OwlMeans Common — Package Dependency Tree

This is the canonical, machine-friendly map of every published `@owlmeans/*` package and its direct dependencies on other `@owlmeans/*` packages. Read it whenever you need to understand the dependency structure of the monorepo: build order, layer boundaries, where to plug a new package, or which package to import from.

**Scope.** All 96 framework packages are included. Test-helper packages (`_tpl`, `test`, `test-auth`, `test-integration`, `test-ui`) are intentionally excluded — they exist to support the testing infrastructure, not to ship to consumers.

**Reading the entries.** Each line `- pkg → dep1, dep2` lists `pkg`'s direct `@owlmeans/*` dependencies (combined `dependencies` + `peerDependencies`, deduplicated, self-references stripped). Non-`@owlmeans/*` deps (React, MUI, Fastify, AJV, axios, etc.) are out of scope here — see each package's own `package.json`.

**The "Quadra" pattern.** Every framework concern is split into up to four layers: **Core** (environment-agnostic) → **Server** (Node/Bun) and **Client** (platform-agnostic React) → **Web** (browser-specific React). React Native lives in a separate [owlmeans/native](https://github.com/owlmeans/native) monorepo and consumes packages from here. The architecture layers below mirror this pattern, with extra layers for shared cross-cutting concerns (auth-common, api-config, infrastructure, domain).

---

## Architecture layers (index)

1. [Configuration & tooling](#1-configuration--tooling) — shared TypeScript configs, scaffolder and skills installer
2. [Core foundations](#2-core-foundations) — environment-agnostic primitives
3. [Cross-cutting domain](#3-cross-cutting-domain) — llm, agent, queue, consent, mailer, flow, iam, payment, oidc, wled
4. [Auth shared](#4-auth-shared) — `auth-common`
5. [API & API config](#5-api--api-config) — HTTP client and runtime config plumbing
6. [Storage & infrastructure](#6-storage--infrastructure) — Mongo, Postgres, Redis, S3, Kubernetes, queue and mail drivers
7. [Server packages](#7-server-packages) — backend (Fastify, Node/Bun)
8. [Client packages (platform-agnostic)](#8-client-packages-platform-agnostic) — React without DOM/Native specifics
9. [Web packages](#9-web-packages) — browser/React DOM
10. [Native packages](#10-native-packages-external-monorepo) — *external monorepo*

---

## 1. Configuration & tooling

Build configuration and the command-line tools that scaffold a project and install agent guidance into it. No framework runtime code — nothing in the layers below imports from here.

- [`dep-config`](packages/dep-config) → *(no `@owlmeans/*` deps)*
- [`agent-skills`](packages/agent-skills) → `agent`, `llm`, `llm-common`
- [`create-app`](packages/create-app) → `agent-skills`

> **Note.** `agent-skills` is the skills installer CLI and `create-app` the scaffolder; `agent-skills` pulls the agent/LLM stack because it runs skill installation through it. Their build position (L7/L8) reflects that tooling dependency, not a framework layer — see [Cross-layer notes](#cross-layer-notes).

## 2. Core foundations

Environment-agnostic primitives. Everything else builds on this layer. Within this layer, the entries are listed in dependency order (lower-level first).

- [`context`](packages/context) → *(no `@owlmeans/*` deps)*
- [`i18n`](packages/i18n) → *(no `@owlmeans/*` deps)*
- [`basic-ids`](packages/basic-ids) → *(no `@owlmeans/*` deps)*
- [`error`](packages/error) → `i18n`
- [`route`](packages/route) → `context`
- [`router`](packages/router) → `context`
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

Domain-level features that are themselves environment-agnostic but sit on top of multiple core primitives. Server, client, and web layers consume these directly, and each one that needs a backend gets its driver in [Storage & infrastructure](#6-storage--infrastructure) and its transport in the server/client layers.

- [`llm-common`](packages/llm-common) → *(no `@owlmeans/*` deps)*
- [`llm`](packages/llm) → `basic-ids`, `context`, `error`, `llm-common`
- [`agent-common`](packages/agent-common) → `error`, `flow`, `llm-common`, `resource`
- [`agent`](packages/agent) → `agent-common`, `basic-ids`, `context`, `error`, `flow`, `llm`, `llm-common`
- [`queue`](packages/queue) → `auth`, `auth-common`, `context`, `entrypoint`, `error`, `resource`, `route`
- [`consent`](packages/consent) → *(no `@owlmeans/*` deps)*
- [`mailer`](packages/mailer) → `context`, `error`
- [`flow`](packages/flow) → `auth`, `config`, `error`, `i18n`, `resource`
- [`iam`](packages/iam) → `auth`, `context`, `error`, `oidc`, `route`
- [`auth-otp`](packages/auth-otp) → `context`, `error`
- [`wled`](packages/wled) → `auth`, `entrypoint`, `route`
- [`payment`](packages/payment) → `auth`, `basic-envelope`, `config`, `context`, `entrypoint`, `error`, `i18n`, `resource`, `route`
- [`oidc`](packages/oidc) → `auth`, `auth-common`, `basic-envelope`, `config`, `context`, `entrypoint`, `resource`, `route`

> **Note.** `queue` is the abstract job/queue contract — `redis-queue` drives it, `server-job` and `client-job` transport it. `mailer` is the abstract mail contract — `mailer-smtp` and `server-mailer-mailgun` drive it. `consent` holds the consent policy and Consent Mode signalling that `web-consent`, `web-gtm` and `astro` render. `llm-common` carries the serializable LLM/execution contracts that both `llm` (runtime) and `agent-common` (graph contracts) build on.

## 4. Auth shared

Sits between core and the server/client auth implementations. References both server-style and client-style entrypoint surfaces.

- [`auth-common`](packages/auth-common) → `auth`, `basic-ids`, `basic-keys`, `client-entrypoint`, `context`, `entrypoint`, `resource`, `route`

> **Note.** `auth-common` references `client-entrypoint` for typed entrypoint helpers shared by both server and client auth flows. This is a deliberate cross-layer dependency — see [Cross-layer notes](#cross-layer-notes).

## 5. API & API config

HTTP client and the runtime API-config endpoint that lets clients discover backend services.

- [`api`](packages/api) → `auth-common`, `client-config`, `client-route`, `config`, `context`, `entrypoint`, `error`, `route`
- [`api-config`](packages/api-config) → `config`, `entrypoint`, `route`
- [`api-config-client`](packages/api-config-client) → `api-config`, `client-context`, `client-entrypoint`, `context`
- [`api-config-server`](packages/api-config-server) → `api-config`, `server-api`, `server-context`, `server-entrypoint`

## 6. Storage & infrastructure

External-system integrations: Mongo, Postgres, Redis, S3-compatible object storage, Kubernetes, and the concrete drivers behind the abstract `queue` and `mailer` contracts. Most of these depend on `server-context` because they are server-only services.

- [`storage-common`](packages/storage-common) → `auth`, `error`
- [`static-resource`](packages/static-resource) → `context`, `error`, `resource`
- [`storage-resource`](packages/storage-resource) → `context`, `error`, `resource`, `server-context`, `storage-common`
- [`image-resource`](packages/image-resource) → `storage-resource`
- [`mongo-resource`](packages/mongo-resource) → `context`, `resource`, `server-context`
- [`mongo`](packages/mongo) → `basic-keys`, `context`, `mongo-resource`, `resource`, `server-context`
- [`redis-resource`](packages/redis-resource) → `basic-ids`, `context`, `resource`, `server-context`
- [`redis`](packages/redis) → `context`, `redis-resource`, `resource`, `server-context`
- [`redis-queue`](packages/redis-queue) → `basic-ids`, `context`, `error`, `queue`, `redis`, `redis-resource`, `resource`, `server-context`
- [`postgres-resource`](packages/postgres-resource) → `basic-ids`, `context`, `resource`, `server-context`
- [`postgres`](packages/postgres) → `basic-keys`, `context`, `postgres-resource`, `resource`, `server-context`
- [`kluster`](packages/kluster) → `config`, `context`, `server-config`, `server-context`
- [`mailer-smtp`](packages/mailer-smtp) → `context`, `mailer`, `server-context`
- [`server-mailer-mailgun`](packages/server-mailer-mailgun) → `context`, `error`, `mailer`

## 7. Server packages

Node/Bun backend implementations built on Fastify. Listed in dependency order.

- [`server-route`](packages/server-route) → `context`, `route`
- [`server-config`](packages/server-config) → `config`, `server-route`
- [`server-context`](packages/server-context) → `client-config`, `config`, `context`, `route`, `server-config`
- [`server-entrypoint`](packages/server-entrypoint) → `context`, `entrypoint`, `route`, `server-route`
- [`server-api`](packages/server-api) → `api`, `auth`, `auth-common`, `context`, `entrypoint`, `error`, `route`, `server-context`, `server-entrypoint`
- [`server-wl`](packages/server-wl) → `context`, `server-api`, `server-context`, `server-entrypoint`, `wled`
- [`server-oidc-provider`](packages/server-oidc-provider) → `config`, `context`, `entrypoint`, `oidc`, `route`, `server-api`, `server-context`
- [`server-socket`](packages/server-socket) → `auth`, `basic-envelope`, `context`, `entrypoint`, `server-api`, `server-auth`, `server-context`, `server-entrypoint`, `socket`
- [`server-auth`](packages/server-auth) → `api`, `api-config-server`, `auth`, `auth-common`, `basic-envelope`, `basic-ids`, `basic-keys`, `client-config`, `client-entrypoint`, `config`, `context`, `entrypoint`, `kluster`, `redis-resource`, `resource`, `route`, `server-api`, `server-context`, `server-entrypoint`, `server-route`, `server-socket`, `socket`, `static-resource`
- [`server-auth-identity`](packages/server-auth-identity) → `auth`, `auth-common`, `basic-ids`, `context`, `mongo-resource`, `oidc`, `resource`, `server-context`
- [`server-auth-otp`](packages/server-auth-otp) → `auth`, `auth-otp`, `basic-ids`, `context`, `mailer`, `oidc`, `redis-resource`, `resource`, `server-auth`, `server-auth-identity`, `server-context`
- [`server-oidc-rp`](packages/server-oidc-rp) → `auth`, `auth-common`, `basic-envelope`, `client-entrypoint`, `config`, `context`, `did`, `entrypoint`, `oidc`, `resource`, `route`, `server-api`, `server-auth`, `server-context`, `server-entrypoint`
- [`server-iam`](packages/server-iam) → `auth`, `context`, `entrypoint`, `iam`, `oidc`, `server-context`, `server-oidc-rp`
- [`server-job`](packages/server-job) → `auth`, `auth-common`, `context`, `entrypoint`, `queue`, `resource`, `route`, `server-api`, `server-context`, `server-entrypoint`, `server-socket`, `socket`
- [`server-app`](packages/server-app) → `api`, `client-config`, `client-entrypoint`, `config`, `context`, `entrypoint`, `kluster`, `route`, `server-api`, `server-auth`, `server-context`, `server-entrypoint`, `server-route`, `server-socket`, `static-resource`

> **Note.** Several server packages depend on `client-config` / `client-entrypoint` for the shared entrypoint/config types that the server uses to mirror the client surface — see [Cross-layer notes](#cross-layer-notes).

## 8. Client packages (platform-agnostic)

React-based, but no DOM or React Native specifics. Web and Native packages consume these. Listed in dependency order.

- [`client-wl`](packages/client-wl) → *(no `@owlmeans/*` deps)*
- [`client-config`](packages/client-config) → `config`
- [`client-context`](packages/client-context) → `api`, `client-config`, `config`, `context`, `i18n`, `route`
- [`client-route`](packages/client-route) → `client-context`, `route`
- [`client-resource`](packages/client-resource) → `client-context`, `context`, `resource`
- [`client-entrypoint`](packages/client-entrypoint) → `api`, `client-config`, `client-context`, `client-route`, `config`, `context`, `entrypoint`, `error`, `route`
- [`client-i18n`](packages/client-i18n) → `client`, `client-context`, `i18n`
- [`client`](packages/client) → `auth`, `client-context`, `client-entrypoint`, `client-resource`, `config`, `context`, `entrypoint`, `error`, `resource`, `router`, `state`
- [`client-did`](packages/client-did) → `auth`, `client`, `client-context`, `client-resource`, `context`, `did`, `state`
- [`client-flow`](packages/client-flow) → `auth-common`, `client`, `client-context`, `client-entrypoint`, `client-resource`, `config`, `context`, `entrypoint`, `error`, `flow`, `resource`, `route`
- [`client-socket`](packages/client-socket) → `auth`, `basic-envelope`, `client`, `client-context`, `client-entrypoint`, `context`, `entrypoint`, `socket`
- [`client-payment`](packages/client-payment) → `client-auth`, `context`, `payment`
- [`client-panel`](packages/client-panel) → `auth`, `client`, `client-auth`, `client-entrypoint`, `client-i18n`, `client-route`, `config`, `entrypoint`, `error`, `i18n`, `router`
- [`client-auth`](packages/client-auth) → `auth`, `auth-common`, `basic-envelope`, `basic-keys`, `client`, `client-context`, `client-entrypoint`, `client-flow`, `client-resource`, `client-socket`, `config`, `context`, `did`, `entrypoint`, `error`, `flow`, `i18n`, `resource`, `socket`, `web-flow`
- [`client-job`](packages/client-job) → `client`, `client-auth`, `client-context`, `client-entrypoint`, `context`, `queue`, `resource`, `socket`, `state`
- [`client-iam`](packages/client-iam) → `client-auth`, `consent`, `context`, `entrypoint`, `iam`, `oidc`, `web-client`, `web-oidc-rp`

> **Note.** Two entries here reach into the web layer, both through plain `dependencies` rather than optional peers. `client-auth` depends on `web-flow` unconditionally, which is why it builds at L10 above `web-flow` at L9. `client-iam` depends on `web-client` and `web-oidc-rp`, so despite the `client-` prefix it is browser-only. See [Cross-layer notes](#cross-layer-notes).

## 9. Web packages

Browser-specific React (DOM, IndexedDB) plus the Astro integration. The panel and OIDC-RP surfaces ship in two UI flavours: `web-panel` / `web-oidc-rp` are the shadcn + Tailwind v4 implementations, `mui-panel` / `mui-oidc-rp` the Material-UI ones kept for existing consumers. Routing defaults to the OwlMeans in-browser plugin (`web-router`); react-router v8 is opt-in via `web-router-react-router`. Listed in dependency order.

- [`web-router`](packages/web-router) → `context`, `router`
- [`web-router-react-router`](packages/web-router-react-router) → `context`, `router`
- [`web-db`](packages/web-db) → `client-context`, `client-resource`, `context`
- [`web-consent`](packages/web-consent) → `consent`
- [`web-gtm`](packages/web-gtm) → `consent`
- [`web-client`](packages/web-client) → `auth`, `auth-common`, `client`, `client-auth`, `client-context`, `client-entrypoint`, `client-i18n`, `client-resource`, `client-route`, `config`, `context`, `error`, `i18n`, `route`, `web-db`, `web-router`
- [`web-flow`](packages/web-flow) → `client`, `client-context`, `client-entrypoint`, `client-flow`, `client-resource`, `context`, `error`, `flow`
- [`web-auth`](packages/web-auth) → `auth`, `auth-common`, `basic-ids`, `basic-keys`, `client`, `client-auth`, `config`, `context`, `web-client`
- [`web-oidc-provider`](packages/web-oidc-provider) → `auth`, `client-flow`, `oidc`, `resource`, `web-client`
- [`web-oidc-rp`](packages/web-oidc-rp) → `auth`, `basic-envelope`, `client`, `client-auth`, `client-flow`, `client-i18n`, `context`, `entrypoint`, `flow`, `oidc`, `resource`, `web-client`, `web-flow`
- [`web-wl`](packages/web-wl) → `client`, `client-entrypoint`, `context`, `wled`
- [`web-panel`](packages/web-panel) → `api-config-client`, `auth`, `auth-common`, `basic-envelope`, `client`, `client-auth`, `client-config`, `client-context`, `client-entrypoint`, `client-flow`, `client-i18n`, `client-panel`, `client-route`, `config`, `context`, `entrypoint`, `error`, `flow`, `i18n`, `queue`, `route`, `web-client`, `web-consent`, `web-db`, `web-flow`, `web-router`
- [`mui-panel`](packages/mui-panel) → `api-config-client`, `auth`, `auth-common`, `basic-envelope`, `client`, `client-auth`, `client-config`, `client-context`, `client-entrypoint`, `client-flow`, `client-i18n`, `client-panel`, `client-route`, `config`, `context`, `entrypoint`, `error`, `flow`, `i18n`, `route`, `web-client`, `web-db`, `web-flow`, `web-router`
- [`mui-oidc-rp`](packages/mui-oidc-rp) → `auth`, `basic-envelope`, `client`, `client-auth`, `client-flow`, `client-i18n`, `context`, `entrypoint`, `flow`, `oidc`, `resource`, `web-client`, `web-flow`
- [`astro`](packages/astro) → `consent`, `web-gtm`

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
- **Several server packages → `client-config` / `client-entrypoint`.** `server-context`, `server-app`, `server-auth` and `server-oidc-rp` mirror the client's entrypoint/config types so that route declarations and config payloads stay in sync across the wire. Server packages do not pull in any DOM or React.
- **`client-auth` → `web-flow`.** A regular `dependency`, not an optional peer: the auth dispatcher component imports `SERVICE_PARAM` from `web-flow`, so every consumer of `client-auth` pulls the web flow package in and `client-auth` builds at L10, above `web-flow` at L9. Native applications use a native flow analogue from the [`native` monorepo](https://github.com/owlmeans/native) for the flow itself, but still carry this edge.
- **`client-iam` → `web-client`, `web-oidc-rp`.** `client-iam` wires the IAM login and consent surface onto a browser app, so despite the `client-` prefix it is browser-only and Native applications do not consume it. Anything in it that must reach React Native belongs in `iam` or `client-auth` instead.
- **Tooling → domain (`create-app` → `agent-skills` → `agent`, `llm`).** The scaffolder and the skills installer are CLIs, not framework layers: they sit in [Configuration & tooling](#1-configuration--tooling) but build after the packages they drive. No runtime framework package depends on either.
- **`astro` → `consent`, `web-gtm`.** The Astro integration composes the browser consent and tag-manager packages for static sites; it is a web-layer package that ships no React.

If you add a new cross-layer dependency, document it here and explain why.

## Build order (topological levels)

Lower levels are compiled before higher ones. `bun run build` orchestrates this via workspace dependency resolution; you usually do not need to think about it. Useful when you suspect a build cycle or are reasoning about partial builds. SCCs (see [Cross-layer notes](#cross-layer-notes)) are listed as a single `{a | b | …}` group.

- **L0** (no `@owlmeans/*` deps): `basic-ids`, `client-wl`, `consent`, `context`, `dep-config`, `i18n`, `llm-common`
- **L1**: `error`, `route`, `router`, `web-consent`, `web-gtm`
- **L2**: `astro`, `auth`, `auth-otp`, `llm`, `mailer`, `resource`, `server-route`, `web-router`, `web-router-react-router`
- **L3**: `basic-keys`, `config`, `entrypoint`, `server-mailer-mailgun`, `socket`, `state`, `static-resource`, `storage-common`
- **L4**: `api-config`, `basic-envelope`, `client-config`, `did`, `flow`, `server-config`, `server-entrypoint`, `wled`
- **L5**: `agent-common`, `payment`, `server-context`, `{api | auth-common | client-context | client-entrypoint | client-route}`
- **L6**: `agent`, `api-config-client`, `client-resource`, `kluster`, `mailer-smtp`, `mongo-resource`, `oidc`, `postgres-resource`, `queue`, `redis-resource`, `server-api`, `storage-resource`
- **L7**: `agent-skills`, `api-config-server`, `client`, `iam`, `image-resource`, `mongo`, `postgres`, `redis`, `server-auth-identity`, `server-oidc-provider`, `server-wl`, `web-db`
- **L8**: `client-did`, `client-flow`, `client-i18n`, `client-socket`, `create-app`, `redis-queue`, `web-wl`, `{server-auth | server-socket}`
- **L9**: `server-app`, `server-auth-otp`, `server-job`, `server-oidc-rp`, `web-flow`
- **L10**: `client-auth`, `server-iam`
- **L11**: `client-job`, `client-panel`, `client-payment`, `web-client`
- **L12**: `mui-oidc-rp`, `mui-panel`, `web-auth`, `web-oidc-provider`, `web-oidc-rp`, `web-panel`
- **L13**: `client-iam`

> Levels are computed from `dependencies` + `peerDependencies` over the `@owlmeans/*` namespace, with strongly connected components collapsed. They are advisory — the authoritative build order is whatever Bun resolves at install time.

---

## Visual dependency map

### Architecture layers (top = highest-level, bottom = foundations)

Dependencies flow downward: every package can only import from the layers below it (cross-layer exceptions are documented in [Cross-layer notes](#cross-layer-notes)).

```
 ╔══════════════════════════════════════════════════════════════════════════════╗
 ║  WEB  (browser-specific React / DOM / shadcn / MUI / Astro)      L1–L12      ║
 ║                                                                              ║
 ║  web-panel        web-client      web-flow        web-router                 ║
 ║  web-oidc-rp      web-oidc-provider  web-auth     web-wl        web-db       ║
 ║  mui-panel        mui-oidc-rp     web-consent     web-gtm       astro        ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CLIENT  (platform-agnostic React — web + React Native)          L0–L13      ║
 ║                                                                              ║
 ║  client-auth      client-panel    client-flow      client                    ║
 ║  client-socket    client-i18n     client-did       client-payment            ║
 ║  client-job       client-iam ─── browser-only despite the name               ║
 ║  client-entrypoint ─┐                                                        ║
 ║  client-context     ├─ SCC (mutual refs)                                     ║
 ║  client-route     ──┘                             client-resource            ║
 ║  client-config    client-wl                                                  ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  SERVER  (Node / Bun / Fastify)                                   L2–L10     ║
 ║                                                                              ║
 ║  server-app       server-auth ─┐                  server-api                 ║
 ║  server-oidc-rp   server-socket┘ SCC              server-oidc-provider       ║
 ║  server-auth-identity  server-auth-otp  server-iam   server-job              ║
 ║  server-entrypoint  server-route  server-context   server-config             ║
 ║  server-wl                                                                   ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  STORAGE & INFRASTRUCTURE                                         L3–L8      ║
 ║                                                                              ║
 ║  mongo            mongo-resource  redis            redis-resource            ║
 ║  storage-resource image-resource  storage-common   static-resource           ║
 ║  kluster          postgres        postgres-resource                          ║
 ║  redis-queue      mailer-smtp     server-mailer-mailgun                      ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  API & API-CONFIG  (HTTP client + runtime config plumbing)        L4–L7      ║
 ║                                                                              ║
 ║  api              api-config      api-config-client  api-config-server       ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  AUTH SHARED                                                          L5     ║
 ║                                                                              ║
 ║  auth-common  (bridges core auth ↔ server + client entrypoint surfaces)      ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CROSS-CUTTING DOMAIN  (environment-agnostic domain logic)        L0–L7      ║
 ║                                                                              ║
 ║  flow             oidc            payment          wled            iam       ║
 ║  queue            consent         mailer           auth-otp                  ║
 ║  llm-common       llm             agent-common     agent                     ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CORE FOUNDATIONS  (environment-agnostic primitives)              L0–L4      ║
 ║                                                                              ║
 ║  context          error           auth             config          i18n      ║
 ║  route            router          entrypoint       resource        state     ║
 ║  socket           did             basic-keys       basic-envelope            ║
 ║  basic-ids                                                                   ║
 ╠══════════════════════════════════════════════════════════════════════════════╣
 ║  CONFIGURATION & TOOLING                                          L0, L7–L8  ║
 ║                                                                              ║
 ║  dep-config (TypeScript configs)  agent-skills (CLI)  create-app (CLI)       ║
 ╚══════════════════════════════════════════════════════════════════════════════╝
```

### Build pyramid (L0 compiles first, L13 last)

```
  L13  █ client-iam
  L12  ██████ mui-oidc-rp  mui-panel  web-auth  web-oidc-provider
               web-oidc-rp  web-panel
  L11  ████ client-job  client-panel  client-payment  web-client
  L10  ██ client-auth  server-iam
   L9  █████ server-app  server-auth-otp  server-job  server-oidc-rp  web-flow
   L8  ███████ client-did  client-flow  client-i18n  client-socket  create-app
               redis-queue  web-wl
        ████ {server-auth ↔ server-socket}
   L7  ████████████ agent-skills  api-config-server  client  iam  image-resource
                mongo  postgres  redis  server-auth-identity  server-oidc-provider
                server-wl  web-db
   L6  ████████████ agent  api-config-client  client-resource  kluster  mailer-smtp
                mongo-resource  oidc  postgres-resource  queue  redis-resource
                server-api  storage-resource
   L5  ███ agent-common  payment  server-context
        █████████████ {api ↔ auth-common ↔ client-context ↔ client-entrypoint ↔ client-route}
   L4  ████████ api-config  basic-envelope  client-config  did  flow
                server-config  server-entrypoint  wled
   L3  ████████ basic-keys  config  entrypoint  server-mailer-mailgun  socket
                state  static-resource  storage-common
   L2  █████████ astro  auth  auth-otp  llm  mailer  resource  server-route
                web-router  web-router-react-router
   L1  █████ error  route  router  web-consent  web-gtm
   L0  ███████ basic-ids  client-wl  consent  context  dep-config  i18n  llm-common
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
├── web-consent  (L1) ← consent
├── queue  (L6) ← auth-common  entrypoint  resource
└── api-config-client  (L6) ← api-config ← config
```

> `←` means "depends on". `↔` means mutual dependency (SCC). `╌╌` marks a node whose subtree is shown elsewhere in the same diagram.

---

## Maintenance

Update this file when:

- A package is added or removed.
- A package's `@owlmeans/*` dependency set changes (added, removed, or moved between `dependencies` / `peerDependencies`).
- A new cross-layer dependency is introduced — also explain why in [Cross-layer notes](#cross-layer-notes).

To regenerate the per-package dep lists, iterate over each `packages/*/package.json` and merge `dependencies` + `peerDependencies` filtered to the `@owlmeans/*` namespace, deduplicated and with self-references stripped. Recompute the SCC list and the topological levels from the same data rather than editing them by hand.
