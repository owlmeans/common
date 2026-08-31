# Memory Graph — common

Shared agent memory (`agent-memory` protocol). Read this file at session start.
Before non-trivial work, open every node whose scope matches the task's files or topics.

## Subsystems

- [[routing]] `packages/router/**, packages/web-router*/**` — plugin-system router; cascade; RouteChain pass-through invariant
- [[entrypoints]] `packages/*entrypoint/**, packages/context/**` — module→entrypoint rename; marker interop; bundler-field gotcha
- [[oidc]] `packages/*oidc*/**` — exact third-party pins; isolation principle; v9/v6 gotchas
- [[auth]] `packages/*auth*/**, packages/web-client/src/login/**` — viable's usage map; gate invariant; the two plugin registries (login seam); Resource.pick() gotcha
- [[shadcn]] `**/components.json, packages/web-*/**` — four durable decisions for the shadcn package family (incl. the consumer `@source`); no-i18n-provider crash; `default: true` child
- [[agent-meta]] `packages/*/agent-meta/**` — sync sharp edges; general-scope skills; strict lint
- [[llm]] `packages/llm/**, packages/llm-common/**` — provider plugins (no ifs); registration order; helpers-vs-utils rule; langchain peer deps; state-nesting fix
- [[agent]] `packages/agent/**, packages/agent-common/**` — agent runtime over LangGraph's functional API; AgentPlugin seam; storage PORTS not resources; first ExecutionPlugin impl; server-side FlowProvider

## Cross-cutting

- [[versioning]] `**/package.json` — synchronized versions; dep-config workspace:*; symlinked downstream repos
