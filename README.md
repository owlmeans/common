# OwlMeans Common

OwlMeans Common is the open-source TypeScript framework behind OwlMeans applications. It provides
typed full-stack entrypoints, context-based composition, authentication, data resources, queue
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

## Typed entrypoints

Declare a protocol once in the shared package. It carries the route, request sections, response,
guards, and gates; it is immutable and has no server or browser behaviour of its own.

```ts
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'

interface CreateProject { name: string }
interface Project { id: string; name: string }

export const projectEntrypoints = {
  create: protocol(
    route('project:create', '/projects', backend(null, RouteMethod.POST)),
    contract.request({ body: typed<CreateProject>() }, typed<Project>())
  ),
}
```

Bind the exact declaration on the server; callback arguments infer from the contract.

```ts
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { projectEntrypoints } from './entrypoints.js'

export const entrypoints = [
  bind(projectEntrypoints.create, handlers<AppContext>().body(async (body, context) =>
    context.projects.create(body)
  )),
]
```

Bind the same declarations in the client context. A direct protocol reference gives `call`,
`invoke`, and `url` their request and response types without a consumer-supplied generic.

```ts
import { bindAll } from '@owlmeans/client-entrypoint'

context.registerEntrypoints(bindAll(projectEntrypoints))

const project = await context.entrypoint(projectEntrypoints.create).call({
  body: { name: 'Roadmap' },
})
```

Use `openProtocol` only where an intentionally untyped boundary is required. Use
`typed<Model>(ajvSchema)` at an AJV declaration boundary so the runtime validator and TypeScript
model stay together. Server handlers use `handlers<Context>().body`, `.params`, or `.request`;
socket handlers use `socketHandler`. Do not create alias-addressed compatibility entrypoints or
replace entries in a mutable declaration list.

## Package families

| Family | Primary packages |
|---|---|
| Contracts and routes | [`entrypoint`](packages/entrypoint), [`route`](packages/route), [`context`](packages/context) |
| Server | [`server-api`](packages/server-api), [`server-entrypoint`](packages/server-entrypoint), [`server-app`](packages/server-app), [`server-socket`](packages/server-socket) |
| Client and web | [`client-entrypoint`](packages/client-entrypoint), [`web-client`](packages/web-client), [`web-panel`](packages/web-panel) |
| Auth and identity | [`auth`](packages/auth), [`auth-common`](packages/auth-common), [`server-auth`](packages/server-auth), [`oidc`](packages/oidc) |
| Data and infrastructure | [`resource`](packages/resource), [`mongo-resource`](packages/mongo-resource), [`postgres-resource`](packages/postgres-resource), [`redis-queue`](packages/redis-queue) |
| App generation and AI | [`create-app`](packages/create-app), [`agent`](packages/agent), [`llm`](packages/llm), [`viable-common`](packages/viable-common) |

The complete dependency and build map is [tree.md](tree.md). Each package has its own README and
canonical skill under [`.agents/skills`](.agents/skills).

The current web family is shadcn UI and Tailwind CSS v4 (`web-panel`). `mui-panel` and
`mui-oidc-rp` are supported only for existing MUI applications.

## Agent guidance

Published packages include generated, version-matched guidance in `agent-meta/`. Install it after
installing OwlMeans packages:

```sh
npx @owlmeans/agent-skills
```

The installer copies applicable skills to `.agents/skills/`; `CLAUDE.md` provides the generated
Claude Code links. In this monorepo, edit only canonical files under `.agents/skills/` and run
`bun run scripts/sync-agent-meta.ts --project common`; never edit package `agent-meta/` copies.

## Contributing

Read [AGENTS.md](AGENTS.md), the relevant package skill, and [tree.md](tree.md) before changing a
package. Package versions are independent; do not synchronize them. Publish only with explicit
operator approval.
