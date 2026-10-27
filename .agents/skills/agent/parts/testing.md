---
name: testing
description: Unit tests of agents and pipelines with a scripted model double and files kept in deps.
metadata:
  purposes: test
  mentions: FakeStreamingChatModel
---

# @owlmeans/agent — Testing

## Testing

Category A (unit, no env, no network). The model is doubled with a small scripted object in
`tests/_tools/model.ts` because `@langchain/core`'s own `FakeStreamingChatModel` always replays its
first response and so cannot drive a tool loop. That double stands in for the MODEL, an external
boundary — never for an `@owlmeans/*` package. A turn's `before` runs while that turn answers (a
person pressing stop or writing to the inbox mid-call), `error` fails the call, and `bound()` tells,
per ask, which tools the asking view was bound with. A stop is a plain `AbortController` the test
aborts from a step, a tool or a turn's `before`. The cumulative-results specs keep the project as a
`Map` of files in `deps` — the durable input extractors read — so a "new process" is a new plugin
over the same files.
