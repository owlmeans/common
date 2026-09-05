---
name: resource-choice
description: Which storage or execution mechanism a feature should use — postgres-resource, mongo-resource, redis-resource, static-resource, state, client-resource, config, storage-resource, queue + worker, or llm/agent. Guidance by similarity to worked cases, with an explicitly skeptical test for asynchronous processing. Use at design time, before writing a resource registration, a schema, or a job declaration.
user-invocable: true
---

# Choosing a resource

Every OwlMeans feature that keeps or moves data picks from the same short list. The list is short
on purpose: one `Resource` contract ([[resource]]) covers all of them, so the choice is about
where the bytes live and when the work runs — not about a new API to learn.

This is guidance by **similarity**, not an algorithm. Find the case under "Worked cases" below
that most resembles what you are building and take its answer; the rules in between say why those
answers came out that way, and how far you can carry one to a case that is not listed. When two
options look equally right, pick the one already registered in the app.

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
| `state` | Client-side records a screen binds to, reached through the context | Anything that must outlive the tab |
| `client-resource` | Client-side records that must survive a reload, over a key-value store (`web-db` gives the browser one) | A query surface — the whole store is walked per read |
| `config` | Reading the records the process was configured with, as a resource | Anything written at runtime — every write is refused |
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
resource: Postgres maps a nested `object` — and an `array` whose items are not plain scalars — to
`jsonb`, where a criteria *object* written against the column becomes containment (`@>`). An
`array` of plain `string`/`integer`/`number`/`boolean` items is a different case: it becomes a
native array column, queried with `$contains` / `$contained` / `$overlaps`.

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

### static-resource, state and client-resource

`static-resource` is a `Map` at module scope wearing the `Resource` contract. It is right for
fixtures, a getting-started app with no database, and short-lived handshake state in a
single-process deployment — and wrong the moment there are two replicas, because each one holds a
different truth. Do not reach for it as a cache in a scaled service; that is Redis.

`state` is the same contract on the client: records a screen binds to through `useStoreModel` /
`useStoreList`, with `watch`/`query` for the live half. Draft state, the current user, a wizard in
progress, an optimistic list. It is a store, not a security boundary — the server re-validates
everything that arrives from it.

`client-resource` is the client store that **survives a reload**: same criteria language, backed by
a key-value store an app registers under `cfg.dbs` (`@owlmeans/web-db` supplies the browser's
IndexedDB one). Reach for it for an offline cache, a remembered filter set, a queued write waiting
for connectivity — and expect the cost, because records live under their own ids with one list of
ids as the only index, so every criteria read walks the store. `state` for what the screen is
holding right now, `client-resource` for what has to be there tomorrow, the server for the truth.

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
- Every processor must be safe to run twice, and `touch()` in every long loop — the broker judges
  liveness by the lock, and silence past `lockDuration` re-runs the job somewhere else.
- Retries default to one attempt, which is right for expensive work and wrong for cheap idempotent
  work — set `attempts` per queue.
- Work that fans out into steps is one `flow(root)` graph, not a processor that enqueues its own
  successors: children complete before the parent runs and it reads their results through
  `children()`. Give the children of a cross-queue flow distinct ids.

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

## Worked cases

Find the row that most resembles what you are building. The answer is a starting point with a
reason attached, not a verdict — if your case differs in a way the rules above care about, the
answer changes with it. `postgres` / `mongo` / `redis` / `static` / `client` / `storage` below mean
the matching `@owlmeans/*-resource` package, `state` and `config` the packages of those names, and
`queue` means `@owlmeans/queue` plus a worker process.

### Records and reads

| Case | Choice | Why |
|---|---|---|
| Audit log | postgres | Append-only rows that are filtered, sorted and paged by whoever reads them; retention is a scheduled delete, not a TTL. |
| Domain records (orders, projects, tickets) | postgres | The default: structure, relations, transactions, one AJV schema that becomes the table. |
| Per-tenant custom forms / submissions | mongo | The shape differs per tenant, so no column list fits; each submission is read whole by id. |
| Generated-app content documents | mongo | Deeply nested, revised whole, never aggregated across. |
| Settings / feature flags per organization entity | postgres | Few rows, read constantly, always by `entityId` — cache in Redis only after measuring, and only if a stale read is harmless. |
| Search over the product's own records | postgres | Start with indexed columns and `jsonb` containment; move to a search engine when a measured query, not a guess, says so. |
| Expensive aggregate on a dashboard | postgres, then redis | Compute it in SQL first. Cache in Redis with a TTL only once the measured query is genuinely slow — a miss must stay invisible. |
| Analytics rollups | postgres + queue | The rollup is a scheduled batch write into its own table; the trigger is a platform cron, the work is a job because it survives restarts. |
| Leaderboard | postgres, redis if hot | A ranked query with an index is enough for most products; move the live top-N into a Redis counter set when it is read far more often than written. |
| Invoice numbering | postgres | A gapless sequence is a transaction and a unique constraint, not a Redis counter — a lost increment is an accounting problem. |
| Records the process was started with (plugins, seeded routes) | config | Already in `cfg`; reading them as a resource gives criteria and sorting without a second store, and every write is refused by design. |

### Expiring, counting, coordinating

| Case | Choice | Why |
|---|---|---|
| Session / OTP cache | redis | Records defined by their expiry; losing one is a re-login, not data loss. Pass the TTL again on every renewal. |
| Password reset token | redis | Single-use and short-lived: `take(id)` hands the record to exactly one caller and throws for the second. |
| Rate limiting | redis | A counter in a window, shared across replicas, that must expire on its own. |
| Counters (views, usage quotas) | redis, reconciled to postgres | Increment in Redis for speed; the billable total belongs in the database, written periodically. |
| Presence / typing indicators | redis | Sub-minute TTL plus pub/sub; nothing is worth persisting. |
| Distributed lock | redis, or the owning resource's `lock` | Redis when the lock guards a process or a third party; the Postgres/Mongo resource's own `lock`/`unlock` when it guards its rows. |
| Idempotency keys for an API | redis | The memory only has to outlive the retry window, and expiry is the cleanup. |
| Webhook signature nonce cache | redis | Replay protection is exactly a key with a TTL. |
| Handshake state in a single-process dev app | static | In-process `Map` with no database; wrong the moment there are two replicas. |
| Fixtures / seeded demo data | static | Records reachable through the context with nothing behind them. |

### Client side

| Case | Choice | Why |
|---|---|---|
| Wizard draft | state (`single: true`) | It belongs to the screen until submitted; only the final submit is a server write. |
| Shopping cart | state, plus postgres when it must persist | Anonymous cart lives on the client; a cart that survives a device change is a database record keyed by user. |
| Optimistic list updates | state | The store the screen binds to, re-validated by the server on write. |
| Notifications feed | postgres, delivered live over sockets | Rows with read/unread state that page; `state` mirrors them for rendering, it does not own them. |
| Offline cache of server records | client (`web-db` in the browser) | Must survive a reload and a lost connection; reads walk the store, so keep the set small and re-sync from the server. |
| Remembered UI preferences (filters, layout) | client | A handful of records per user that must outlive the tab, with nothing on the server worth a row. |

### Files and bytes

| Case | Choice | Why |
|---|---|---|
| File upload | storage + postgres | Bytes to the bucket, the record (url, size, mime, owner) in the database — a bucket has no index to query. |
| File post-processing (thumbnails, virus scan) | queue | Survives a restart, retried against tools that fail transiently, and the user must not wait for it. |
| PDF / report generation | queue | Multi-second CPU work whose result is a stored file; return a job id, deliver the file when it exists. |
| GDPR data export | queue + storage | Minutes of reads across every resource, produced once, downloaded later from a bucket. |
| OCR | queue + llm/model call | External, slow, retried — every reason on the list at once. |

### Asynchronous work and third parties

| Case | Choice | Why |
|---|---|---|
| Long CSV / JSON import | queue, staged in postgres | The user cannot hold a request open for thousands of rows, and a half-finished import must be resumable. |
| Bulk email | queue | Thousands of provider calls, each retried independently; one bad address must not fail the batch. |
| Transactional email (one recipient, one event) | inline | A single provider call inside the request; queue it only if the send is on a user's critical path and the provider is slow. |
| Payment capture | queue with idempotent job ids | Retried against a third party, must survive a restart, must never double-charge — derive the job id from the payment. |
| Third-party sync / reconciliation | queue, triggered by platform cron | Recurring, long, retried; the framework has no scheduler, so a `CronJob` enqueues it. |
| Webhook fan-out | queue, one job per subscriber | Per-endpoint retries and backoff; a slow subscriber must not delay the others. |
| Scheduled digest | queue, triggered by platform cron | Same shape as any recurring batch — cron enqueues, the worker sends. |
| Scheduled reminders | postgres row + cron sweep, or `JobOptions.delay` | Use `delay` for a one-shot minutes-away nudge; anything cancellable or far in the future is a row a periodic sweep picks up. |
| Inbound webhook handling | inline ack, queue the work | Answer 2xx immediately, then process — a third party's retry policy is not a design input for your handler. |
| Cache warmup after a deploy | queue, or nothing | Usually not worth it: let the first requests populate the cache unless a measured cold-start hurts. |

### Model-driven features

| Case | Choice | Why |
|---|---|---|
| Chat with an assistant | agent, streamed inline; postgres for the transcript | The user is watching, so stream rather than queue; persist the conversation as ordinary records. |
| Content moderation by model | llm + queue | Every rule that can be written down stays a rule; the model handles the rest, off the request path. |
| Translation of stored content | llm + queue | Batch work over many records, paid per attempt, retried carefully — never on a page render. |
| Recommendations refresh | llm or postgres batch + queue | A periodic recompute whose output is stored; the read path only ever reads the stored result. |
| Summarizing a long document on demand | llm inline if streamed, else queue | A single streamed `ask` keeps the user informed; a pipeline over sections is queue work. |

## Related

- [[resource]] — the contract every option implements, and the criteria language they share
- [[postgres-resource]], [[mongo-resource]], [[redis-resource]], [[static-resource]],
  [[state]], [[client-resource]], [[web-db]], [[config]], [[storage-resource]] — the backends
- [[queue]], [[redis-queue]] — job queues and the worker process
- [[llm]], [[agent]] — model-driven work
- [[reuse-code]] — find the `@owlmeans/*` package before designing anything new
