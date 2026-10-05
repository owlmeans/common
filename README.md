# OwlMeans Common

OwlMeans Common is the open-source TypeScript framework behind OwlMeans applications. It provides
immutable full-stack entrypoint protocols, context-based composition, cryptographic authentication,
one data-resource contract over several databases, queue and socket transports, and React web
packages. Packages are ESM and work with Bun workspaces or ordinary npm installs.

## Start here

Create a complete starter application:

```sh
npm create @owlmeans/app@latest my-app
# or
bun create @owlmeans/app my-app
```

The generated app has a shared contract package, Fastify API, and shadcn/Tailwind web app. For the
scaffolded and manual paths, see [Getting started](docs/getting-started.md).

For this monorepo, use Bun:

```sh
bun install
bun run build
bun run test
```

## Why OwlMeans Common — and why not

### Strengths

- **Agent-first.** Every published package ships version-matched skills in `agent-meta/`, and
  `@owlmeans/agent-skills` installs them into a project's `.agents/skills/`. The scaffolder also
  writes `AGENTS.md`, a shared memory graph and a self-education loop, so a coding agent works
  from the framework's own rules rather than from guesses.
- **Protocol-first contracts.** One immutable declaration carries the route, the typed and
  AJV-validated request and response, and the access rules. The server, the browser, a socket and a
  queue all bind that same object, so a changed contract breaks the compile on both sides at once.
- **Security built in, not bolted on.** Ed25519 key pairs and DIDs are the base credential. Guards
  and gates are declared on the protocol, and the organization entity model keeps a renameable
  slug on the wire and a stable id in storage.
- **One resource contract.** MongoDB, PostgreSQL, Redis, in-memory config records and the browser
  state store all answer `get`/`load`/`list`/`save`/`delete` with the same criteria language, sort
  and paging rules.
- **Swappable carriers.** `context.entrypoint(protocol).call()` goes over HTTP, a WebSocket or a
  job queue depending on the route declaration. Moving a call to a queue changes one declaration,
  not every call site.
- **Explicit composition.** One context per process, built by one factory from idempotent
  `append*` mixins. No decorators, no hidden container scanning, and no global singletons.
- **Exercised in production.** The OwlMeans Viable platform runs on these packages. The packages
  are MIT-licensed, strict TypeScript and ESM-only.

### Trade-offs

- **Pre-1.0.** Packages are published as `rc` releases with independent, deliberately uneven
  versions. APIs still move between releases.
- **Its own vocabulary.** Contexts, alias registries, protocols, guards and gates are in-house
  abstractions. They take time to learn and do not transfer from other frameworks.
- **Agent-first documentation.** The most complete and current guidance is in the skills, which
  are written for coding agents. Human-facing docs are thinner.
- **A fixed stack.** The server is Fastify, the web layer is React with shadcn UI and Tailwind v4,
  and tooling is centred on Bun. Other servers or view libraries need their own adapters.
- **Two web families.** The legacy MUI packages (`mui-panel`, `mui-oidc-rp`) remain for existing
  apps next to the current shadcn family.
- **Small ecosystem.** There are few third-party integrations, examples or community answers. React
  Native packages live in the separate `native` monorepo.

## Core concepts

| Term | Meaning | Package |
|---|---|---|
| **Context** | The one container a process runs in. It holds three flat registries keyed by alias — services, resources and entrypoints — where a later registration replaces an earlier one. `configure().init()` moves it through the `Configuration → Loading → Ready` stages. | [`context`](packages/context) |
| **Context factory / `append*` mixin** | Each layer exports a `makeContext(cfg)` that calls the factory of the layer below and applies its own idempotent `appendX(context)` mixins. An app writes exactly one factory the same way and calls it once. | [`server-app`](packages/server-app), [`web-panel`](packages/web-panel) |
| **Config** | The typed application config built by the layer's `config()`. It declares the services the app talks to, security, brand, plugin records and config records. | [`config`](packages/config) |
| **Service route** | A `service({ type, service, host, port, base })` entry in the config. It tells every app where another service lives, and entrypoints compute absolute addresses from it. | [`config`](packages/config) |
| **Service** | A named object bound to one context, created with `createService(alias, impl)` and read with `context.service(alias)`. Services with an `init` take part in the context lifecycle. | [`context`](packages/context) |
| **Resource** | Storage behind the uniform `Resource<T>` contract: CRUD plus one criteria, sort and paging language. It is registered on the context, and the backend is chosen by the resource package, not by the caller. | [`resource`](packages/resource) |
| **Route** | `route(alias, path, backend() \| frontend())`: an immutable declaration of a path segment, method, parent and service. Full paths and addresses are computed on demand against the context. | [`route`](packages/route) |
| **Protocol** | `protocol(route, contract, options)`: a route plus a typed request/response contract (`typed<T>(ajvSchema)`) plus `guards` and `gate`. It is a shared value with no server or browser behaviour, kept in a named `*Protocols` tree. | [`entrypoint`](packages/entrypoint) |
| **Entrypoint (binding)** | A protocol materialized in one context: `bind(protocol, handler)` on the server, `bindAll` or `bindScreen` in the browser, then `context.registerEntrypoints(...)`. `context.entrypoint(protocol)` answers `call()` for the value, `invoke()` for the value plus outcome, and `url()` for the address. | [`server-entrypoint`](packages/server-entrypoint), [`client-entrypoint`](packages/client-entrypoint) |
| **Handler** | A server function created from a protocol with `handlers<Context>().body`, `.params` or `.request`. Its arguments are inferred from the contract, and the request is validated before it runs. | [`server-api`](packages/server-api) |
| **Screen** | A frontend protocol bound to a React component with `bindScreen(protocol, handler(Component))`. A screen is navigated to (`url()`), never called. | [`client-entrypoint`](packages/client-entrypoint), [`client`](packages/client) |
| **Guard** | An authentication service named in a protocol's `guards`. The guard whose `match()` accepts the request resolves the `Auth` identity — the bearer guard `DEFAULT_GUARD`, `GUARD_ED25519` or OIDC. Guards are inherited from parent routes. | [`auth-common`](packages/auth-common), [`server-auth`](packages/server-auth) |
| **Gate** | An authorization service named in a protocol's `gate` (with `gateParams`). After authentication the server calls `gate.assert(request, response, params)` for the entrypoint's own gate and every ancestor's. | [`entrypoint`](packages/entrypoint), [`server-api`](packages/server-api) |
| **Transport** | A service registered under `transport:<protocol>` that carries `call()` for every route on that protocol. Without one the call goes over HTTP. Queue and socket transports plug in here. | [`entrypoint`](packages/entrypoint), [`queue`](packages/queue) |
| **Plugin** | An implementation chosen at runtime from a registry: router plugins, authentication and login plugins, LLM provider plugins and agent plugins. Config plugin records (`plugin(cfg, record)`) carry their settings. | [`router`](packages/router), [`client-auth`](packages/client-auth), [`llm`](packages/llm) |
| **Organization entity** | The customer or tenant. `entitySlug` is the renameable name and the only organization value on the wire. `entityId` is the stable record id used by storage and grants, obtained on the server with `makeEntityScope(req).requireEntityKey()`. | [`auth`](packages/auth), [`auth-common`](packages/auth-common) |
| **State store** | The browser's in-memory resource with live subscriptions, registered with `appendStateResource`. React reads it through `useStoreList` and `useStoreModel`. | [`state`](packages/state), [`client`](packages/client) |
| **Flow** | A serializable step/transition state machine whose whole state is one string, so a multi-step process survives redirects and reloads. | [`flow`](packages/flow), [`client-flow`](packages/client-flow) |
| **Resilient error** | A registered error class that marshals across a service boundary and is restored as the same class on the other side, with i18n-aware messages. | [`error`](packages/error) |
| **Agent skill / agent-meta** | Version-matched guidance for coding agents. Each package ships it in `agent-meta/`, and `npx @owlmeans/agent-skills@^0.1.18-rc.48` installs it. | [`agent-skills`](packages/agent-skills) |

## How an application is shaped

A typical OwlMeans application is three workspaces: a shared contract, a backend and a frontend.

```mermaid
flowchart LR
  common["common<br/>*Protocols trees, config, types, AJV schemas"]
  api["api<br/>server-app context + bind(protocol, handler)"]
  web["web<br/>web-panel context + bindAll / bindScreen"]
  common --> api
  common --> web
  web -- "context.entrypoint(protocol).call()" --> api
```

Declare a protocol once in the shared package. It carries the route, request sections, response,
guards and gates; it is immutable and has no server or browser behaviour of its own.

```ts
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'

interface CreateProject { name: string }
interface Project { id: string; name: string }

// Alias strings remain private to the declaration module. Runtime code imports protocol objects.
const aliases = { base: 'project', create: 'project:create' } as const
const projectBase = protocol(route(aliases.base, '/projects', backend()), contract())

export const projectProtocols = {
  base: projectBase,
  create: protocol(
    route(aliases.create, '/', backend({ parent: projectBase, method: RouteMethod.POST })),
    contract.request({ body: typed<CreateProject>() }, typed<Project>())
  ),
}
```

Bind the exact declaration on the server; callback arguments infer from the contract.

```ts
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { projectProtocols } from './protocols.js'

const api = handlers<AppContext>()
export const serverBindings = [
  bind(projectProtocols.base),
  bind(projectProtocols.create, api.body(projectProtocols.create, async (body, context) =>
    context.projects.create(body)
  )),
]
```

Bind the same declarations in the client context. A direct protocol reference gives `call`,
`invoke`, and `url` their request and response types without a consumer-supplied generic.

```ts
import { bindAll } from '@owlmeans/client-entrypoint'

const clientBindings = bindAll(projectProtocols)
context.registerEntrypoints(clientBindings)

const project = await context.entrypoint(projectProtocols.create).call({
  body: { name: 'Roadmap' },
})
```

Use `openProtocol` only where an intentionally untyped boundary is required. Use
`typed<Model>(ajvSchema)` at an AJV declaration boundary so the runtime validator and TypeScript
model stay together. Server handlers use `handlers<Context>().body`, `.params`, or `.request`;
socket handlers use `connection(protocol, callback)`. Keep shared declarations in a named
`*Protocols` tree and keep materialized server/browser lists local (`*Bindings` or, where a public
API already calls it so, `entrypoints`). Do not create alias-addressed compatibility entrypoints or
replace entries in a mutable declaration list. Alias lookup is only for an intentionally dynamic
registry or broker boundary, never normal application code.

## Package catalogue

[`tree.md`](tree.md) is the dependency and build-order reference. Each package has its own README
and a canonical skill under [`.agents/skills`](.agents/skills).

### Application packages

These are the packages application code imports directly and most often. Their READMEs carry
concepts, worked examples, the full export list and common pitfalls.

**Shared contract** — imported by the `common` workspace and by both sides.

| Package | What it gives an app | Key exports |
|---|---|---|
| [`context`](packages/context) | The per-process container for services, resources and entrypoints | `createService`, `assertContext`, `AppType`, `ContextStage`, `BASE`/`HOME`/`GUEST` |
| [`config`](packages/config) | The typed application config and the service map | `service`, `plugin`, `makeSecurityHelper`, `appendConfigResource`, `configHelper` |
| [`entrypoint`](packages/entrypoint) | Immutable, typed protocol declarations shared by server and client | `protocol`, `openProtocol`, `contract`, `typed`, `EntrypointOutcome` |
| [`route`](packages/route) | Route declarations: path segment, method, parent, service | `route`, `backend`, `frontend`, `RouteMethod`, `RouteProtocols` |
| [`resource`](packages/resource) | One CRUD, criteria and paging contract for every store | `Resource`, `Criteria`, `ListResult`, `UnknownRecordError`, `createListSchema` |
| [`auth`](packages/auth) | The authentication vocabulary: identity types, roles, errors | `Auth`, `AuthPayload`, `AuthRole`, `AuthForbidden`, `authHelper` |
| [`error`](packages/error) | Errors that survive a service boundary with their class intact | `ResilientError`, `ResilientError.ensure`, `ResilientError.marshal` |

**Server** — the backend workspace.

| Package | What it gives an app | Key exports |
|---|---|---|
| [`server-app`](packages/server-app) | The backend bootstrap: one context factory and one `main` | `makeContext`, `main`, `config`, `sservice`, `entrypoints` |
| [`server-api`](packages/server-api) | Fastify HTTP server and protocol-typed handler factories | `handlers`, `createApiServer`, `appendApiServer` |
| [`server-entrypoint`](packages/server-entrypoint) | Materializes shared protocols with server handlers | `bind`, `bindAll` |
| [`server-auth`](packages/server-auth) | The Ed25519 bearer guard and the authentication service | `appendAuthService`, `makeAuthService`, `AUTH_CACHE` |
| [`server-auth-identity`](packages/server-auth-identity) | Local identities, profiles, provider linking and the organization-entity resolver | `appendAuthIdentityResources`, `IdentityLinkingService`, `makeEntityResolverService` |
| [`server-socket`](packages/server-socket) | WebSocket entrypoints bound from socket protocols | `connection`, `appendSocketService`, `createSocketMiddleware` |
| [`server-oidc-rp`](packages/server-oidc-rp) | Server-side OIDC relying party, guard and wrapped tokens | `appendOidcGuard`, `oidcEntrypoints`, `makeOidcClientService` |

**Data and jobs** — storage backends and queues behind the resource and transport contracts.

| Package | What it gives an app | Key exports |
|---|---|---|
| [`mongo-resource`](packages/mongo-resource) | MongoDB resources with schema validation, encryption and migrations | `makeMongoResource`, `MongoResource` |
| [`postgres-resource`](packages/postgres-resource) | PostgreSQL resources with the same contract and migrations | `makePostgresResource`, `PostgresResource` |
| [`redis-resource`](packages/redis-resource) | Redis resources: TTL records, pub/sub, streams, counters | `makeRedisResource`, `RedisResource` |
| [`queue`](packages/queue) | Job queues as resources and the QUEUE route transport | `declareQueue`, `listenQueues`, `queueProtocolOf` |

**Browser** — the web workspace.

| Package | What it gives an app | Key exports |
|---|---|---|
| [`web-panel`](packages/web-panel) | The web context factory, shadcn navigation shell, forms and panels | `makeContext`, `PanelApp`, `NavLayout`, `HOME` |
| [`web-client`](packages/web-client) | Browser bootstrap, rendering and the base client entrypoints | `makeContext`, `render`, `entrypoints` |
| [`client`](packages/client) | Platform-agnostic React hooks for context, navigation and state | `useContext`, `useNavigate`, `useStoreList`, `useStoreModel`, `useValue` |
| [`client-entrypoint`](packages/client-entrypoint) | Binds shared protocols for browser calls and screens | `bindAll`, `bindScreen`, `bind`, `ClientProtocolEntrypoint` |
| [`client-auth`](packages/client-auth) | Browser authentication service, sign-in manager and login plugins | `useSelfAuth`, `entrypoints`, `./manager`, `./login` |
| [`state`](packages/state) | The client state store with live subscriptions | `appendStateResource`, `StateModel` |

### Supporting packages

Lower-level building blocks, feature families and tooling. Most applications reach them through the
application packages above, or add one when they need that specific feature.

| Group | Package | Purpose |
|---|---|---|
| Configuration and tooling | [`agent-skills`](packages/agent-skills) | The CLI that installs embedded package guidance into a project, and the prompt plugins that load package and project skills |
|  | [`cli-auth`](packages/cli-auth) | OAuth device-authorization sign-in for a command-line tool: the `~/.owlmeans` credentials file, a cross-process sign-in lock and a browser opener |
|  | [`create-app`](packages/create-app) | Scaffold a fullstack OwlMeans app — its common, api and web packages — or, with `--bare`, the demo-free shell |
|  | [`dep-config`](packages/dep-config) | Shared TypeScript configuration for `@owlmeans` packages |
|  | [`viable-mcp`](packages/viable-mcp) | An MCP server that lets a coding agent build full-stack web applications with the OwlMeans Viable platform |
|  | [`viable-sdk`](packages/viable-sdk) | Drive the Viable platform from outside it: the connector session, the local slot executor and the tool catalogue |
| Core foundations | [`basic-envelope`](packages/basic-envelope) | Signed, typed, time-limited payload envelopes, serialized as a wrap or a token |
|  | [`basic-ids`](packages/basic-ids) | Random identifiers, v4 UUIDs and human-readable word slugs |
|  | [`basic-keys`](packages/basic-keys) | Ed25519 key pairs, signing and verification, the key model and its auth plugins |
|  | [`did`](packages/did) | The derivable owlmk key type, DID key models and a wallet over a three-resource store |
|  | [`i18n`](packages/i18n) | The core localization registry packages register their strings in (no runtime dependencies) |
|  | [`router`](packages/router) | The UI routing plugin host: the router service, cascade selection, the route IR and the matcher |
|  | [`socket`](packages/socket) | The transport-agnostic Connection model, its message types and the socket errors |
| Cross-cutting domain | [`agent`](packages/agent) | Context-aware LLM agents over LangGraph's functional API, and resumable checkpointed pipelines |
|  | [`agent-common`](packages/agent-common) | Runtime-free agent contracts: conversation identity, the run lifecycle and pipeline declarations |
|  | [`auth-otp`](packages/auth-otp) | Email-OTP sign-in contracts: the auth type, the service and cache names, the code length and lifetime |
|  | [`consent`](packages/consent) | The cookie-consent model, its categories, the storage contract and Consent Mode v2 signalling |
|  | [`flow`](packages/flow) | A serializable step/transition state machine whose whole state is one string |
|  | [`iam`](packages/iam) | The provider-agnostic IAM service, permission definitions and grants, and `hasPermission` |
|  | [`job`](packages/job) | Browser-safe application job projections, schemas and entrypoint contracts |
|  | [`llm`](packages/llm) | The LLM inference runtime: provider plugins, the model factory, policy-driven execution and prompt composition |
|  | [`llm-common`](packages/llm-common) | Runtime-free serializable contracts for LLM inference and execution |
|  | [`mailer`](packages/mailer) | The MailerService contract and a console transport for development and tests |
|  | [`marketing-consent`](packages/marketing-consent) | Marketing-consent contracts: the opt-in/opt-out catalogue, revision-aware status, terms acceptance and the consent protocol tree |
|  | [`oidc`](packages/oidc) | The OIDC names both sides share: the gate, the guard, requested scopes, provider descriptors and the dispatcher entrypoints |
|  | [`payment`](packages/payment) | Provider-agnostic payment contracts: protocols, checkout policies, catalogue records, entitlement gates and consumer rights |
|  | [`planning`](packages/planning) | Runtime-free planning contracts: workcards, projects, specifications, status flows, the transition fold, scoped schemas and the protocol tree |
|  | [`viable-common`](packages/viable-common) | Runtime-free contracts of the OwlMeans Viable platform |
|  | [`wled`](packages/wled) | The shared white-label contract: company info, styles, brand media and DNS shapes |
| Auth shared | [`auth-common`](packages/auth-common) | The auth vocabulary both sides share: guard aliases, the auth protocol trees, the Ed25519 guard and the organization-entity helpers |
|  | [`auth-token`](packages/auth-token) | Long-lived access tokens (API keys): the record, the token format, the management entrypoints and the carrier guard |
|  | [`oauth`](packages/oauth) | Shared OAuth 2.1 contracts: device authorization, authorization code with PKCE, the metadata documents and the consent flow |
| API and runtime config | [`api`](packages/api) | The HTTP client service that carries entrypoint calls between services, with typed transport errors |
|  | [`api-config`](packages/api-config) | The runtime config document a backend advertises: its entrypoint and the allowlist plugins |
|  | [`api-config-client`](packages/api-config-client) | Fetches the runtime config a backend advertises and merges it into the client config at boot |
|  | [`api-config-server`](packages/api-config-server) | Answers the runtime config endpoint from package-owned allowlist plugins |
| Storage and infrastructure | [`image-resource`](packages/image-resource) | Image-shaped names and schemas over the shared stored-file types |
|  | [`kluster`](packages/kluster) | The Kubernetes API client service and the `kluster:` config directive that resolves cluster addresses at boot |
|  | [`mailer-smtp`](packages/mailer-smtp) | The SMTP (nodemailer) transport for the MailerService contract |
|  | [`marketing-consent-mongo`](packages/marketing-consent-mongo) | Mongo storage for the two marketing-consent resources |
|  | [`marketing-consent-postgres`](packages/marketing-consent-postgres) | Postgres tables for the two marketing-consent resources of a generated target project |
|  | [`mongo`](packages/mongo) | The MongoDB connection service, cluster setup and the field-encryption backend |
|  | [`planning-postgres`](packages/planning-postgres) | A durable Postgres planning store: four tables, an inline fold under a per-card advisory lock and a LISTEN/NOTIFY commit bus |
|  | [`postgres`](packages/postgres) | The PostgreSQL connection service, its health checks and the least-privilege bootstrap path |
|  | [`redis`](packages/redis) | The Redis connection service registered on a server context |
|  | [`redis-queue`](packages/redis-queue) | The BullMQ-over-Redis driver for `@owlmeans/queue` |
|  | [`server-mailer-mailgun`](packages/server-mailer-mailgun) | The Mailgun production email transport |
|  | [`static-resource`](packages/static-resource) | An in-process Resource over a module-scope map, for records an app holds in memory |
|  | [`storage-common`](packages/storage-common) | Shared object and file storage types, errors and model |
|  | [`storage-resource`](packages/storage-resource) | An upload-only S3-compatible object storage resource with MIME sniffing |
| Server | [`server-auth-otp`](packages/server-auth-otp) | The email-OTP auth plugin and OtpService for passwordless sign-in |
|  | [`server-auth-session`](packages/server-auth-session) | The seven-day session registry, with memory and Redis implementations |
|  | [`server-auth-token`](packages/server-auth-token) | The server half of access tokens: the store, the verifying guard, the management handlers and the coguard |
|  | [`server-config`](packages/server-config) | `sservice()` for backend service routes, file-mounted config values and the server config shape |
|  | [`server-context`](packages/server-context) | `makeServerContext()`, the server config shape and the file config reader |
|  | [`server-iam`](packages/server-iam) | One-call OIDC relying-party wiring and the IAM gate for unscoped and resource-scoped permissions |
|  | [`server-job`](packages/server-job) | Technical queue work exposed as sanitized application job views behind an authenticated policy |
|  | [`server-marketing-consent`](packages/server-marketing-consent) | The database-agnostic MarketingConsentService and its guarded handlers |
|  | [`server-oauth`](packages/server-oauth) | An OAuth 2.1 authorization server that mints ordinary access tokens on approval |
|  | [`server-oidc-provider`](packages/server-oidc-provider) | An embedded OIDC identity provider on top of `oidc-provider` |
|  | [`server-payment`](packages/server-payment) | Protocol-bound payment resources, entitlement gates and Stripe checkout |
|  | [`server-planning`](packages/server-planning) | The planning service and plugin registry, the transition executor, the in-memory store, the handlers and the store conformance suite |
|  | [`server-route`](packages/server-route) | Server-side route models: matching a request against a mounted path |
|  | [`server-wl`](packages/server-wl) | The server half of the white-label contract: the provide entrypoint and its provider seams |
| Client | [`client-config`](packages/client-config) | The base client config shape and `addWebService()` |
|  | [`client-context`](packages/client-context) | `makeClientContext()`, the platform-agnostic base of every web and native context |
|  | [`client-did`](packages/client-did) | The browser and native DID wallet service, and signing an authentication challenge with it |
|  | [`client-flow`](packages/client-flow) | The platform-agnostic flow service and the runner a screen drives through a flow |
|  | [`client-i18n`](packages/client-i18n) | The React i18n context over i18next, language switching and deferred language packs |
|  | [`client-iam`](packages/client-iam) | One-call OIDC relying-party wiring for a browser app: the IAM guard, consent before sign-in and the login hooks |
|  | [`client-job`](packages/client-job) | Sanitized application job views in a browser: `useJob`, `useJobs` and one feed subscription |
|  | [`client-panel`](packages/client-panel) | Cross-platform panel and form components and the headless navigation model |
|  | [`client-payment`](packages/client-payment) | The browser PaymentService with a cached shallow identity |
|  | [`client-planning`](packages/client-planning) | The remote planning facade, the state mirror and the subscribe-then-poll commit wait, for a browser or a Node client |
|  | [`client-resource`](packages/client-resource) | A client-side caching resource for in-memory or persistent storage |
|  | [`client-route`](packages/client-route) | Marking a route model as client-side and extracting its parameters |
|  | [`client-socket`](packages/client-socket) | A self-restoring WebSocket connection to a socket entrypoint, with its status aggregator and hook |
|  | [`client-wl`](packages/client-wl) | The reserved platform-neutral slot of the white-label stack |
| Web | [`astro`](packages/astro) | Astro wiring for the browser packages: the head and noscript strings, the legal-page test and locale conversion |
|  | [`mui-oidc-rp`](packages/mui-oidc-rp) | The legacy MUI browser OIDC relying party |
|  | [`mui-panel`](packages/mui-panel) | The legacy MUI v7 browser layer |
|  | [`web-auth`](packages/web-auth) | Web authentication plugins for the shared client-auth registry, including the development supervisor login |
|  | [`web-auth-token`](packages/web-auth-token) | The browser half of access tokens: the management panel and its hook |
|  | [`web-consent`](packages/web-consent) | The React cookie-consent dialog, its re-open button, the cookie-policy page and the consent hooks |
|  | [`web-db`](packages/web-db) | IndexedDB-backed browser storage |
|  | [`web-flow`](packages/web-flow) | The browser flow service that rehydrates a flow from the URL, and `useFlow()` |
|  | [`web-gtm`](packages/web-gtm) | The Google tag head snippet with Consent Mode defaults, the id validator and the CSP host lists |
|  | [`web-marketing-consent`](packages/web-marketing-consent) | The browser half of marketing consent: the privacy-choices screen, the settings card and the login step |
|  | [`web-oauth`](packages/web-oauth) | The consent, device-code and done screens an OAuth 2.1 sign-in ends on |
|  | [`web-oidc-provider`](packages/web-oidc-provider) | The browser state behind an embedded OIDC provider's interaction screens |
|  | [`web-oidc-rp`](packages/web-oidc-rp) | The browser OIDC relying party: the guard, the entrypoints and the dispatcher screen |
|  | [`web-payment`](packages/web-payment) | Protocol-bound payment hooks and the themed amount checkout UI |
|  | [`web-router`](packages/web-router) | The default in-browser routing plugin: the History API, the matcher and the React provider |
|  | [`web-router-react-router`](packages/web-router-react-router) | The opt-in React Router v8 routing plugin |
|  | [`web-wl`](packages/web-wl) | The browser half of the white-label contract: the caching service and the logo component |
| Test support | [`test`](packages/test) | Foundation test helpers: `.env` loading, required variables and environment gates |
|  | [`test-auth`](packages/test-auth) | The only package with authentication mocks: fixture key pairs, trusted-record stores and guards |
|  | [`test-integration`](packages/test-integration) | The env-gated integration harness: service gates and per-run namespaces |
|  | [`test-ui`](packages/test-ui) | Playwright-as-a-library helpers for bun-test component acceptance tests |

The current web family is shadcn UI and Tailwind CSS v4 (`web-panel`). `mui-panel` and
`mui-oidc-rp` are supported only for existing MUI applications.

## Agent guidance

Published packages include generated, version-matched guidance in `agent-meta/`. Install it after
installing OwlMeans packages:

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.48
```

The installer copies applicable skills to `.agents/skills/`; `AGENTS.md` documents the generated
Claude Code links. In this monorepo, edit only canonical files under `.agents/skills/` and run
`bun run scripts/sync-agent-meta.ts --project common`; never edit package `agent-meta/` copies.

## Contributing

Read [AGENTS.md](AGENTS.md), the relevant package skill, and [tree.md](tree.md) before changing a
package. Package versions are independent; do not synchronize them. Publish only with explicit
operator approval.
