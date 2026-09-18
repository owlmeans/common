---
node: planning
scope: "packages/{planning,server-planning,client-planning}/**, packages/viable-common/src/planning/**"
updated: 2026-09
---

# Planning (workcards, transitions, commits)

Rules live in the `planning`, `server-planning` and `client-planning` skills; this node keeps what
cost time to find.

## Facts that cost time to rediscover

- **`after` hooks run where the transition is FOLDED, once per commit** — the settle is a CAS on
  `commit.state: pending`. A second process subscribing to the bus would fire them twice.
- **A hook must never await work that writes to the card it is folding.** The write's commit can
  fold only after this fold releases the card's claim, so an awaited reply holds both until a
  timeout. Enqueue it.
- **A generic fold must fold PAST a failed transition** (cursor moves, record unchanged), or every
  later transition of that card stays pending forever.
- **Limits are sized for real payloads**: `TITLE_MAX` 2048 (story narratives, project prompts),
  `DESCRIPTION_MAX` 16384, `BODY_MAX` 1 MB (a `StoryDesign` JSON). The first e2e refused at the
  original 512 / 4096 / 128 K.
- **All three packages need `ajv-formats` as a runtime dependency** (the schema registry compiles
  formats); it is not transitively guaranteed.
- **`client-socket` imports React**, so `client-planning` takes the socket as an injected opener and
  the SDK runs long-poll only.
- **Wire queries are encoded** (`encodeWorkcardQuery` & twins): a URL carries no arrays or nested
  objects, and a hand-built query string silently drops `fields`/`sort`.

Related: [[queues]] (hook merge, job ids, unsigned enqueue), [[viable]] (the Viable vocabulary and
connector tools over the facade), [[entrypoints]].
