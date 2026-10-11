---
node: planning
scope: "packages/{planning,planning-auth,server-planning,client-planning,planning-postgres}/**, packages/viable-common/src/planning/**"
updated: 2026-10
---

# Planning (workcards, transitions, commits)

Rules live in the `planning`, `planning-auth`, `server-planning`, `client-planning` and `planning-postgres` skills;
this node keeps what cost time to find.

## Facts

- **Limits are sized for real payloads**: `TITLE_MAX` 2048 (story narratives, project prompts),
  `DESCRIPTION_MAX` 16384, `BODY_MAX` 1 MB (a `StoryDesign` JSON). A refused create on a long
  title or a large design body means a limit, not a schema bug.
- **All four packages need `ajv-formats` as a runtime dependency** (the schema registry compiles
  formats); it is not transitively guaranteed.
- **`client-socket` imports React**, so `client-planning` takes the socket as an injected opener and
  the SDK runs long-poll only.
- **Memory and Postgres settle an out-of-order row differently** (memory: failed; Postgres past the
  grace: placeholder + committed) — the conformance case asserts only "settled, never pending".

## Invariants

- **`after` hooks run where the transition is FOLDED, once per commit** — the settle is a CAS on
  `commit.state: pending`. A second process subscribing to the bus fires them twice.
- **A hook never awaits work that writes to the card it is folding.** That write's commit folds
  only after this fold releases the card, so both hold until a timeout. Enqueue it.
- **A generic fold folds PAST a failed transition** (cursor moves, record unchanged), or every
  later transition of that card stays pending forever.
- **A narrowed list/count admits what a single read admits.** Broke when violated: under a
  `projects` scope `cards.get` answered a task's document while `cards.list({ kind: specification })`
  came back without it — the list criteria lacked the `through` parent cards.
- **View and write are separate access sets** (`projects` vs `writes`): a resolver that answers only
  `projects` lets every viewer execute. Broke when violated: view-only members of a generated
  target moved and created cards.

## Gotchas

- **Wire queries are encoded** (`encodeWorkcardQuery` & twins): a hand-built query string silently
  drops `fields`/`sort` (a URL carries no arrays or nested objects).
- **`foldPending` fails a gap and the row right after an already-failed one as out of order** (it
  lists pending rows only). On Postgres `nextSeq`/`append` are two round trips, so gaps are routine:
  the prelude bounds each call to the consecutive pending run — unbounded, it failed every row past
  a young gap.
- **An aborted Postgres transaction lies quietly**: after one failed statement every later one
  answers `25P02`, `COMMIT` becomes a silent `ROLLBACK`, and `foldPending`'s `safely` swallows the
  original — the runner tracks "poisoned" and reports the FIRST error, not the cascade.
- **Generated code invents the create call**: `draft:` for `card:` (`malformed:create-without-draft`),
  `wait: true` inside the execution (ignored in process), `ctx.planning()` in a target (not a
  function), `name`/`key` on a type or flow (`SchemaInvalid`) — each compiles only through an
  `any`-typed helper. Counter: the wrong-form table in `server-planning`, run by
  `server-planning/tests/create-example.spec.ts`.

Related: [[queues]] (hook merge, job ids, unsigned enqueue), [[viable]] (the Viable vocabulary and
connector tools over the facade), [[entrypoints]].
