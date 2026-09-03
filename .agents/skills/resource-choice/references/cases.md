# Archetypal cases

Find the row that most resembles what you are building. The answer is a starting point with a
reason attached, not a verdict — if your case differs in a way the rationale cares about, the
answer changes with it. Read [`../SKILL.md`](../SKILL.md) for the rules these rows follow, in
particular the test asynchronous work has to pass before it is worth its complexity.

`postgres` / `mongo` / `redis` / `static` / `state` / `storage` below mean the matching
`@owlmeans/*-resource` package; `queue` means `@owlmeans/queue` plus a worker process.

## Records and reads

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

## Expiring, counting, coordinating

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

## Client side

| Case | Choice | Why |
|---|---|---|
| Wizard draft | state (`single: true`) | It belongs to the screen until submitted; only the final submit is a server write. |
| Shopping cart | state, plus postgres when it must persist | Anonymous cart lives on the client; a cart that survives a device change is a database record keyed by user. |
| Optimistic list updates | state | The store the screen binds to, re-validated by the server on write. |
| Notifications feed | postgres, delivered live over sockets | Rows with read/unread state that page; `state` mirrors them for rendering, it does not own them. |

## Files and bytes

| Case | Choice | Why |
|---|---|---|
| File upload | storage + postgres | Bytes to the bucket, the record (url, size, mime, owner) in the database — a bucket has no index to query. |
| File post-processing (thumbnails, virus scan) | queue | Survives a restart, retried against tools that fail transiently, and the user must not wait for it. |
| PDF / report generation | queue | Multi-second CPU work whose result is a stored file; return a job id, deliver the file when it exists. |
| GDPR data export | queue + storage | Minutes of reads across every resource, produced once, downloaded later from a bucket. |
| OCR | queue + llm/model call | External, slow, retried — every reason on the list at once. |

## Asynchronous work and third parties

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

## Model-driven

| Case | Choice | Why |
|---|---|---|
| Chat with an assistant | agent, streamed inline; postgres for the transcript | The user is watching, so stream rather than queue; persist the conversation as ordinary records. |
| Content moderation by model | llm + queue | Every rule that can be written down stays a rule; the model handles the rest, off the request path. |
| Translation of stored content | llm + queue | Batch work over many records, paid per attempt, retried carefully — never on a page render. |
| Recommendations refresh | llm or postgres batch + queue | A periodic recompute whose output is stored; the read path only ever reads the stored result. |
| Summarizing a long document on demand | llm inline if streamed, else queue | A single streamed `ask` keeps the user informed; a pipeline over sections is queue work. |
