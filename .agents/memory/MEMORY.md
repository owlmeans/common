# Memory Graph — common

Shared agent memory (`agent-memory` protocol). Read this file at session start.
Before non-trivial work, open every node whose scope matches the task's files or topics.

## Subsystems

- [[context]] `packages/context/**, packages/*-context/**` — three flat alias registries (last wins); one context per process, one factory; init order; exact lookup-error texts
- [[routing]] `packages/router/**, packages/web-router*/**` — plugin-system router; cascade; RouteChain pass-through invariant
- [[entrypoints]] `packages/*entrypoint/**, packages/*route/**, packages/context/**` — immutable declarations; call/invoke/url; idempotent elevate; transport seam
- [[resources]] `packages/resource/**, packages/*-resource/**, packages/{mongo,postgres,redis}/**, packages/state/**` — one CRUD contract; criteria language; per-backend paging; redis SCAN limits
- [[queues]] `packages/queue/**, packages/redis-queue/**` — QUEUE protocol as a transport; declare-vs-listen split; BullMQ connection and prefix rules; processor obligations
- [[oidc]] `packages/*oidc*/**` — exact third-party pins; isolation principle; v9/v6 gotchas
- [[auth]] `packages/*auth*/**, packages/web-client/src/login/**` — viable's usage map; gate invariant; the two plugin registries (login seam); take() deletes; identity linking = one email → one profile, each method a credential (`findPlatformIdentity`); an `email-otp:` row with no login service is somebody's END USER, never a platform login
- [[shadcn]] `**/components.json, packages/web-*/**` — four durable decisions for the shadcn package family (incl. the consumer `@source`); no-i18n-provider crash; `default: true` child
- [[agent-meta]] `packages/*/agent-meta/**` — sync sharp edges; general-scope skills; strict lint
- [[llm]] `packages/llm/**, packages/llm-common/**` — provider plugins (no ifs); registration order; helpers-vs-utils rule; langchain peer deps; state-nesting fix
- [[agent]] `packages/agent/**, packages/agent-common/**` — agent runtime over LangGraph's functional API; AgentPlugin seam; storage PORTS not resources; first ExecutionPlugin impl; server-side FlowProvider

## Cross-cutting

- [[versioning]] `**/package.json` — synchronized versions; dep-config workspace:*; symlinked downstream repos
