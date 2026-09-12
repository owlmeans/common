# OwlMeans Common

OwlMeans Common is the open-source TypeScript framework behind OwlMeans applications. It provides
immutable full-stack entrypoint protocols, context-based composition, authentication, data resources, queue
transports, and React web packages. Packages are ESM and work with Bun workspaces or ordinary npm
installs.

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

## Protocol-first entrypoints

Declare a protocol once in the shared package. It carries the route, request sections, response,
guards, and gates; it is immutable and has no server or browser behaviour of its own.

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

Every published package is linked here; [`tree.md`](tree.md) is the dependency and build-order
reference. Framework packages are grouped by architectural layer, with test support listed last.

| Layer | Packages |
|---|---|
| Configuration and tooling | [`agent-skills`](packages/agent-skills), [`create-app`](packages/create-app), [`dep-config`](packages/dep-config), [`viable-mcp`](packages/viable-mcp), [`viable-sdk`](packages/viable-sdk) |
| Core foundations | [`auth`](packages/auth), [`basic-envelope`](packages/basic-envelope), [`basic-ids`](packages/basic-ids), [`basic-keys`](packages/basic-keys), [`config`](packages/config), [`context`](packages/context), [`did`](packages/did), [`entrypoint`](packages/entrypoint), [`error`](packages/error), [`i18n`](packages/i18n), [`resource`](packages/resource), [`route`](packages/route), [`router`](packages/router), [`socket`](packages/socket), [`state`](packages/state) |
| Cross-cutting domain | [`agent`](packages/agent), [`agent-common`](packages/agent-common), [`auth-otp`](packages/auth-otp), [`consent`](packages/consent), [`flow`](packages/flow), [`iam`](packages/iam), [`llm`](packages/llm), [`llm-common`](packages/llm-common), [`llm-delegate`](packages/llm-delegate), [`mailer`](packages/mailer), [`oidc`](packages/oidc), [`payment`](packages/payment), [`queue`](packages/queue), [`viable-common`](packages/viable-common), [`wled`](packages/wled) |
| Auth shared | [`auth-common`](packages/auth-common), [`auth-token`](packages/auth-token) |
| API and runtime config | [`api`](packages/api), [`api-config`](packages/api-config), [`api-config-client`](packages/api-config-client), [`api-config-server`](packages/api-config-server) |
| Storage and infrastructure | [`image-resource`](packages/image-resource), [`kluster`](packages/kluster), [`mailer-smtp`](packages/mailer-smtp), [`mongo`](packages/mongo), [`mongo-resource`](packages/mongo-resource), [`postgres`](packages/postgres), [`postgres-resource`](packages/postgres-resource), [`redis`](packages/redis), [`redis-queue`](packages/redis-queue), [`redis-resource`](packages/redis-resource), [`server-mailer-mailgun`](packages/server-mailer-mailgun), [`static-resource`](packages/static-resource), [`storage-common`](packages/storage-common), [`storage-resource`](packages/storage-resource) |
| Server | [`server-api`](packages/server-api), [`server-app`](packages/server-app), [`server-auth`](packages/server-auth), [`server-auth-identity`](packages/server-auth-identity), [`server-auth-otp`](packages/server-auth-otp), [`server-auth-token`](packages/server-auth-token), [`server-config`](packages/server-config), [`server-context`](packages/server-context), [`server-entrypoint`](packages/server-entrypoint), [`server-iam`](packages/server-iam), [`server-job`](packages/server-job), [`server-oidc-provider`](packages/server-oidc-provider), [`server-oidc-rp`](packages/server-oidc-rp), [`server-payment`](packages/server-payment), [`server-route`](packages/server-route), [`server-socket`](packages/server-socket), [`server-wl`](packages/server-wl) |
| Client | [`client`](packages/client), [`client-auth`](packages/client-auth), [`client-config`](packages/client-config), [`client-context`](packages/client-context), [`client-did`](packages/client-did), [`client-entrypoint`](packages/client-entrypoint), [`client-flow`](packages/client-flow), [`client-i18n`](packages/client-i18n), [`client-iam`](packages/client-iam), [`client-job`](packages/client-job), [`client-panel`](packages/client-panel), [`client-payment`](packages/client-payment), [`client-resource`](packages/client-resource), [`client-route`](packages/client-route), [`client-socket`](packages/client-socket), [`client-wl`](packages/client-wl) |
| Web | [`astro`](packages/astro), [`mui-oidc-rp`](packages/mui-oidc-rp), [`mui-panel`](packages/mui-panel), [`web-auth`](packages/web-auth), [`web-auth-token`](packages/web-auth-token), [`web-client`](packages/web-client), [`web-consent`](packages/web-consent), [`web-db`](packages/web-db), [`web-flow`](packages/web-flow), [`web-gtm`](packages/web-gtm), [`web-oidc-provider`](packages/web-oidc-provider), [`web-oidc-rp`](packages/web-oidc-rp), [`web-panel`](packages/web-panel), [`web-payment`](packages/web-payment), [`web-router`](packages/web-router), [`web-router-react-router`](packages/web-router-react-router), [`web-wl`](packages/web-wl) |
| Test support | [`test`](packages/test), [`test-auth`](packages/test-auth), [`test-integration`](packages/test-integration), [`test-ui`](packages/test-ui) |

Each package has its own README and
canonical skill under [`.agents/skills`](.agents/skills).

The current web family is shadcn UI and Tailwind CSS v4 (`web-panel`). `mui-panel` and
`mui-oidc-rp` are supported only for existing MUI applications.

## Agent guidance

Published packages include generated, version-matched guidance in `agent-meta/`. Install it after
installing OwlMeans packages:

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The installer copies applicable skills to `.agents/skills/`; `CLAUDE.md` provides the generated
Claude Code links. In this monorepo, edit only canonical files under `.agents/skills/` and run
`bun run scripts/sync-agent-meta.ts --project common`; never edit package `agent-meta/` copies.

## Contributing

Read [AGENTS.md](AGENTS.md), the relevant package skill, and [tree.md](tree.md) before changing a
package. Package versions are independent; do not synchronize them. Publish only with explicit
operator approval.
