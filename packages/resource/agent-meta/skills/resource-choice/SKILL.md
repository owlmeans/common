---
name: resource-choice
description: Which storage or execution mechanism a feature should use — postgres-resource, mongo-resource, redis-resource, static-resource, state, storage-resource, queue + worker, or llm/agent. Guidance by similarity to worked cases, with an explicitly skeptical test for asynchronous processing. Use at design time, before writing a resource registration, a schema, or a job declaration.
user-invocable: true
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Choosing a resource

Every OwlMeans feature that keeps or moves data picks from the same short list. The list is short
on purpose: one `Resource` contract ([[resource]]) covers all of them, so the choice is about
where the bytes live and when the work runs — not about a new API to learn.

This is guidance by **similarity**, not an algorithm. Find the case in
[`references/cases.md`](references/cases.md) that most resembles what you are building and take
its answer; the rules below say why those answers came out that way, and how far you can carry one
to a case that is not listed. When two options look equally right, pick the one already registered
in the app.

## The default

**Postgres.** `@owlmeans/postgres-resource` is the answer for records the product owns and the
product queries: users, orders, projects, comments, settings, audit rows. It gets the default
because it is the only backend here that gives all of relational integrity, real query planning,
transactions, and DDL derived from the resource's AJV schema — and because being wrong with it is
cheap. Nothing else on this page is a place to *start*; each one is a place to move to for a named
reason.

Say "start with Postgres, move only if measured" out loud whenever the argument for something else
is a guess about load. A resource that turns out to be hot moves later, and the criteria objects,
paging and sorting come with it unchanged — that portability is what makes deferring the decision
safe.

## The options

| Option | It is for | It is not for |
|---|---|---|
| `postgres-resource` | Records with structure, relations, and queries — the default | Anything the schema cannot describe up front |
| `mongo-resource` | Documents whose shape varies per record or per tenant; deep nesting read whole | Rows you will join, sum, or report across |
| `redis-resource` | Data with an expiry, a lock, a counter, or a fan-out — and a **small, namespaced** key set | A source of truth, or an unbounded keyspace (`list`/`count` walk it) |
| `static-resource` | In-process records with no database behind them — fixtures, handshake state, a per-process cache | Anything that must survive a restart or be seen by a second replica |
| `state` | Client-side records a screen binds to, reached through the context | Anything the server must trust |
| `storage-resource` | The **bytes** of a file, in an S3-compatible bucket (upload only) | The record describing the file — that stays in postgres or mongo |
| `queue` + a worker process | Work that must outlive the request, be retried, or be spread over workers | Anything the request can finish itself (see below) |
| `llm` / `agent` | Work whose output is judgement or language, not a computation | A rule you can write down |

### Postgres or Mongo

Ask what a *reader* does with the record. Filter, sort, join, aggregate, report — Postgres, and
the AJV schema becomes the table ([[postgres-resource]]). Load whole by id, with a shape that
differs per record and a nesting depth no column list wants to model — Mongo, and the AJV schema
becomes the validator ([[mongo-resource]]). Both carry migrations, indexes, locks and the same
criteria language, so this is a modelling decision, not a capability one.

A single varying corner inside an otherwise relational record is not a reason to move the whole
resource: Postgres maps an `array` or nested `object` property to `jsonb`, and a criteria object
against it becomes containment.

### Redis and the four things it is actually good at

`redis-resource` earns its place when the data has one of these properties, not when it is merely
"fast":

- **Expiry** — the record is meant to disappear: sessions, OTPs, nonces, magic-link tokens, an
  idempotency key's memory. TTL is a per-call option on `create`/`update`/`save`, and `update`
  rewrites the key, so a renewal must pass the TTL again or the record becomes permanent.
- **Cache** — a derived value it would be embarrassing to recompute per request. A cache is
  correct only if a miss is invisible to the user; if losing it changes behaviour, it is state, and
  state belongs in the database.
- **Lock** — one worker at a time, with an expiry so a dead holder does not block forever. Postgres
  and Mongo resources also expose `lock`/`unlock`; use theirs when the lock guards *their* rows.
- **Counter / rate limit / fan-out** — increments, windows, and pub/sub between processes.

The hard limit: reads by id are single-key commands, but `load(where)`, `list`, `count` and `purge`
**walk the resource's namespace** with `SCAN` and evaluate criteria in memory, unpaged and not
cluster-safe. A resource that needs real queries belongs in Mongo or Postgres, however hot it is.

### static-resource and state

`static-resource` is a `Map` at module scope wearing the `Resource` contract. It is right for
fixtures, a getting-started app with no database, and short-lived handshake state in a
single-process deployment — and wrong the moment there are two replicas, because each one holds a
different truth. Do not reach for it as a cache in a scaled service; that is Redis.

`state` is the same contract on the client: records a screen binds to through `useStoreModel` /
`useStoreList`, with `watch`/`query` for the live half. Draft state, the current user, a wizard in
progress, an optimistic list. It is a store, not a security boundary — the server re-validates
everything that arrives from it.

### Files

Bytes go to `storage-resource` (upload only — a bucket has no index). The **record** describing
them — url, size, mime type, owner, status — goes in a database resource, and that record is what
answers criteria, sorting and paging. Image-shaped names and schemas for it are in
[[image-resource]].

## Be skeptical about queues

Asynchronous processing is the most over-applied answer on this page. It multiplies the number of
places a feature can fail, it needs a second process to deploy and watch, and it makes every
processor a thing that must be safe to run twice. Do not add it because the work "feels heavy".

**A request that finishes in under ~2 seconds and makes no external call never queues.** Do it
inline and return the answer.

Asynchronous work earns its complexity when at least one of these is true:

1. **The user would otherwise wait more than ~5 seconds.** Not "the work takes 5 seconds" — the
   *user waits*. Work nobody is watching can still be inline if the caller is a script.
2. **It must survive a process restart.** A deploy, an OOM kill, or a pod eviction mid-operation
   would otherwise lose work that was already accepted, and nothing would retry it.
3. **It is retried against a third party.** Payment captures, provider syncs, mail sends and
   webhook deliveries fail transiently and must be re-attempted with backoff, without the user
   re-submitting.

If none holds, the honest answer is "do it in the request". If exactly one holds, look for the
smaller fix first: a database index, a batch write, a cached aggregate, or an HTTP call moved off
the critical path. Reach for the broker when the work is genuinely detached from the request.

When you do queue ([[queue]], driver [[redis-queue]]):

- A queued call is an ordinary entrypoint call — `job()` in place of `backend()`. Nothing at the
  call site says "queue", so this stays a declaration change.
- Derive `JobOptions.id` from what the job is ABOUT (`develop:<storyId>`) and a duplicate enqueue
  is a no-op. That is what makes an admission step safe to retry.
- `reply: false` is fire-and-forget; the default waits for the value. Choose deliberately.
- Every processor must be safe to run twice, and `touch()` in every long loop.
- Retries default to one attempt, which is right for expensive work and wrong for cheap idempotent
  work — set `attempts` per queue.

**There is no scheduler in the framework.** `JobOptions.delay` defers one job once; anything
recurring — a nightly digest, an hourly reconciliation — is triggered from outside the process by
a platform cron (a Kubernetes `CronJob` in a [[kluster]] deployment) that calls a normal entrypoint
or enqueues a job. Do not simulate cron with a self-re-enqueueing job.

## Model-driven work

Reach for [[llm]] when the output is language or judgement — summaries, classification with fuzzy
boundaries, extraction from prose, moderation, translation — and for [[agent]] when the work needs
several turns, tools, or memory across a conversation. Everything a rule can express should stay a
rule: a regex, a criteria object, or an AJV schema is cheaper, deterministic, and testable.

Model calls are slow and paid for per attempt, so they interact with the previous section:

- A single `ask` behind a user's click is fine inline when it streams; the user sees progress.
- A pipeline of calls, or work over many records, is queue work — it is exactly case 1 and 3 above.
- A blind retry re-spends the tokens that just failed. That is why queue retries default to one.
- Store the *result* in a normal resource. A model output nobody persisted will be paid for again.

## Choosing more than one

Most real features use two. A file upload is `storage-resource` for the bytes plus a Postgres row
for the record. A rate limiter is Redis for the window plus Postgres for the policy. An import is
a Postgres staging table plus a queue for the work plus Redis for the progress the UI polls. Split
by property — durability, expiry, size, latency — and let each part sit where that property is
cheap.

## Related

- [`references/cases.md`](references/cases.md) — 30+ archetypal product cases mapped to a choice
- [[resource]] — the contract every option implements, and the criteria language they share
- [[postgres-resource]], [[mongo-resource]], [[redis-resource]], [[static-resource]],
  [[state]], [[storage-resource]] — the backends
- [[queue]], [[redis-queue]] — job queues and the worker process
- [[llm]], [[agent]] — model-driven work
- [[reuse-code]] — find the `@owlmeans/*` package before designing anything new
