# Memory Graph — common

Shared agent memory (`agent-memory` protocol). Read this file at session start.
Before non-trivial work, open every node whose scope matches the task's files or topics.

## Subsystems

- [[routing]] `packages/router/**, packages/web-router*/**` — plugin-system router; cascade; RouteChain pass-through invariant
- [[entrypoints]] `packages/*entrypoint/**, packages/context/**` — module→entrypoint rename; marker interop; bundler-field gotcha
- [[oidc]] `packages/*oidc*/**` — exact third-party pins; isolation principle; v9/v6 gotchas
- [[auth]] `packages/*auth*/**` — viable's usage map; gate invariant; Resource.pick() gotcha
- [[shadcn]] `**/components.json, packages/web-*/**` — three durable decisions for the shadcn package family
- [[agent-meta]] `packages/*/agent-meta/**` — sync sharp edges; general-scope skills; strict lint

## Cross-cutting

- [[versioning]] `**/package.json` — synchronized versions; dep-config workspace:*; symlinked downstream repos
