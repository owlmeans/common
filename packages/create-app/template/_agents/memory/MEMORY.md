# Memory Graph — __APP_NAME__

Shared agent memory (`agent-memory` protocol). Read this file at session start.
Before non-trivial work, open every node whose scope matches the task's files or topics.

No nodes yet. On the first durable finding, create `.agents/memory/<node>.md` and add exactly one
line here under the matching group: `- [[<node>]] ` + backticked scope + ` — <hook>` (hook ≤ 100
chars, no dates). Delete this notice and any group still empty once real nodes exist; add an
`## Integrations` group when an external service earns a node.

## Subsystems

_(none yet — nodes named for `sources/common`, `sources/api`, `sources/web` land here)_

## Cross-cutting

_(none yet — `build`, `testing`, `deploy`, `routing`, `i18n`, `workspace` land here)_
