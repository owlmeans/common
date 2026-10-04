# Memory Graph — common

Shared agent memory (`agent-memory` protocol). Read this file at session start.
Before non-trivial work, open every node whose scope matches the task's files or topics.

## Subsystems

- [[context]] `packages/context/**, packages/*-context/**` — three flat alias registries (last wins); one context per process, one factory; init order; exact lookup-error texts
- [[routing]] `packages/router/**, packages/web-router*/**` — plugin-system router; cascade; RouteChain pass-through invariant
- [[entrypoints]] `packages/*entrypoint/**, packages/*route/**, packages/context/**` — immutable protocol declarations; bind/call/invoke/url; transport seam
- [[resources]] `packages/resource/**, packages/*-resource/**, packages/{mongo,postgres,redis}/**, packages/state/**` — one CRUD contract; criteria language; per-backend paging; redis SCAN limits; drizzle array params; Postgres re-rendered definitions
- [[queues]] `packages/queue/**, packages/redis-queue/**` — QUEUE transport; declare-vs-listen split; BullMQ prefix rules; schedules as job schedulers; processors
- [[payments]] `packages/{payment,server-payment,client-payment,web-payment}/**` — ranked plans + free plan; capabilities vs limits; admission-first ledger; gross-up; consumer rights
- [[oidc]] `packages/*oidc*/**` — exact pins; isolation; pairwise `sub`/sector rules; RP session record; v9/v6 gotchas
- [[auth]] `packages/*auth*/**, packages/web-client/src/login/**` — one account per e-mail; rows per (account, app, org); gate needs own app; acting-org session
- [[shadcn]] `**/components.json, packages/web-*/**` — four durable decisions for the shadcn package family (incl. the consumer `@source`); no-i18n-provider crash; `default: true` child
- [[agent-meta]] `packages/*/agent-meta/**` — sync sharp edges; general-scope skills; strict lint
- [[llm]] `packages/llm/**, packages/llm-common/**` — provider plugins (no ifs); registration order; helpers-vs-utils rule; langchain peer deps; state-nesting fix
- [[agent]] `packages/agent/**, packages/agent-common/**` — agent runtime over LangGraph's functional API; AgentPlugin seam; storage PORTS not resources; first ExecutionPlugin impl; server-side FlowProvider
- [[planning]] `packages/{planning,server-planning,client-planning,planning-postgres}/**` — hooks run where folded; fold past failures; narrowed list = single read; Postgres gaps, aborted txns
- [[logging]] `packages/{log,web-log,viable-log}/**, **/logger(` — one logging system; global state; console override; config timing; token redaction; Fastify adapter
- [[viable]] `packages/viable-{common,sdk,mcp}/**` — connector family; contracts vs product-side refusals; npx version skew; agent-output presentation taxonomy

## Cross-cutting

- [[versioning]] `**/package.json` — uneven per-package versions; stale build/ leftovers; skill-only drift; build race
