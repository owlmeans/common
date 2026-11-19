---
name: retries
description: The connection and progress deadlines (bytes vs content, the per-attempt traffic observer), escalation by failure class (climb vs attempt), passing an outer attempt into the escalator, isFatalError for loops above the model, guided regeneration and the default correction after a schema refusal, the repeat stop, opt-in pruning, ladder notices and the terminal failure observation hook.
metadata:
  purposes: agent
  mentions: MODEL_STREAM_TIMEOUT_MS, MODEL_PROGRESS_TIMEOUT_MS, streamTimeout, progressTimeout, LlmFetchObserver, observe, stream-stalled, escalation, LlmCallOptions, retryHelper, isFatalError, withRetry, RetryOptions, FALLBACK_AFTER_ATTEMPTS, LlmSpectator, LlmSpectatorNotice, LlmNoticeKind, LlmGuide, LlmOutputRejection, LlmSchemaRejection, LlmRetryExceededError, prune, climb
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm — Deadlines and retry loops

## Hangs are bounded by liveness: a connection deadline and a progress deadline

A long call and a dead one look the same from the outside, so neither deadline is a total cap — each
bounds a kind of SILENCE, and both end the attempt with a retryable `LlmModelError('stream-stalled:…')`
that is asked again at the same budget and effort (a stall never climbs).

| Deadline | Re-armed by | Value | Catches |
|---|---|---|---|
| connection | every LangChain chunk AND every byte the attempt's client receives — SSE comments, keepalives, pings, a background poll's `: poll` | `streamTimeout` → `LlmServiceOptions.streamTimeout` → `MODEL_STREAM_TIMEOUT_MS` (3 min) | a provider that accepted the request and sends nothing at all |
| progress | LangChain chunks only (content, reasoning, tool-call arguments, metadata) | `max(progressTimeout, streamTimeout)`; `progressTimeout` → `LlmServiceOptions.progressTimeout` → `MODEL_PROGRESS_TIMEOUT_MS` (10 min) | a connection kept alive by keepalives with nothing behind them — the backstop |

The bytes come from a per-attempt traffic observer (`LlmFetchObserver`), never AsyncLocalStorage:
`makeLlmModel` builds one for every attempt and hands it to the rung plugin's `refine` as
`LlmRefineParams.observe`; the plugin gives the REFINED instance `observe.wrap(<its fetch>)` — the
OpenAI family wraps `configuration.fetch` (the global fetch when it has none), Anthropic
`clientOptions.fetch` — so `build`'s configuration and the transport seam stay untouched, and two
attempts in flight never hear each other. The wrapper is a pull-based `ReadableStream` around the
response body that notes each read. The progress deadline is armed only once the attempt's observer
saw a request leave, so a call that makes none (a delegated performer, whose plugin ignores
`observe`) never gets one; a rung without a plugin gets no observer and streams exactly as before.
The observer is disarmed at the finish (before the usage drain) and when the stream ends: late
bytes re-arm nothing. A plain attempt streams once; a call with look tools streams one turn per
round on the same refined client, and re-arms the observer before each (`rearm`: armed, no request
seen yet).

Stream creation and each iterator read race an independently rejecting deadline; forwarding an abort
signal alone does not bound an SDK promise that ignores cancellation. Late values never reach the
caller, late failures are observed, and best-effort iterator cleanup never delays the timeout,
terminal chunks or consumer cancellation. Set the values for a deployment where the application
composes its context (`LlmServiceOptions`); a preset naming its own keeps it, and both travel to a
fallback on another provider (`PROVIDER_NEUTRAL_FIELDS`). A provider that keeps a hung request alive
with comments forever (OpenRouter's `: OPENROUTER PROCESSING`) is noticed by the progress deadline —
a preset that must notice it sooner sets `progressTimeout` equal to its `streamTimeout`. Neither
bounds retries: a fatal error misclassified as retryable still multiplies its own latency by
`DEFAULT_MODEL_RETRIES`.

## Escalation follows the failure class

Each attempt of a call has three numbers, handed to the rung's plugin `refine` (`LlmRefineParams`):

| Number | Counts | Drives |
|---|---|---|
| `attempt` | `escalation` + the attempt's index | which rung runs (`FALLBACK_AFTER_ATTEMPTS` each), and `> 0` on every retry (the delegate re-asks its performer with it) |
| `climb` | `escalation` + BUDGET-FIXABLE failures so far | the output budget doubling and the absolute reasoning-cap halving |
| `rungAttempt` | budget-fixable failures since the call entered the rung (from the seed's own position on its first rung) | the effort climb |

Budget-fixable = a null, empty or unparseable answer, and a filter refusal (`LlmOutputRejection`
included): a fuller answer may pass. A schema refusal, a stalled stream (either deadline, or a lost
background stream) and a transport or provider error are NOT — they are asked again at the same budget and effort, so a wrong shape never buys a
5-minute xhigh attempt. A plugin reads `climb ?? attempt` for the budget and `rungAttempt ?? attempt`
for effort; called directly with only `attempt`, it behaves as it always did.

## An outer validation loop must pass its attempt in

A caller that validates the OUTPUT — a diff that has to apply, a file that must not come back
truncated — runs its own retry loop around whole `ask` calls. Every one of those calls starts a FRESH
inner loop at attempt 0, so the escalator's rungs never move: same model, same output budget,
same deterministic answer, N times. Pass `escalation: <outer attempt>` in `LlmCallOptions` and the
per-call escalator starts that far up its ladder instead — it seeds the rung (`attempt`) AND the
budget (`climb`), so the `maxTokens` doubling and the `FALLBACK_AFTER_ATTEMPTS` switch to
`ModelConfig.fallback` both advance. It is clamped to `retries - 1`, moves the STARTING position only,
and never changes how many attempts the call makes. The model switch depends on preset data rather
than code: the role must declare a `fallback`. `LlmCallOptions.fatal` is the lever in the other
direction — a per-call resolver consulted before the global ones and the plugin's `isFatal`, for an
error the caller knows no retry can fix.

### A loop ABOVE the model asks the same question with `retryHelper.isFatalError`

A retry loop is not the only place that decides to carry on: a fix ladder rescues a failed repair and
climbs to a stronger model, an agent runner catches a round that threw and reports "gave up". Both
are right for a model that answered badly and wrong for a budget that ran out, and a blanket `catch`
cannot tell them apart — an exhausted balance becomes more expensive calls instead of a halt.
`retryHelper.isFatalError(e, fatal?)` runs the same resolvers, in the same order, that `retryHelper.withRetry` uses, and
returns the error to abort WITH (a resolver may unwrap a carrier and hand back the real cause) or
`null` when nothing considers it terminal. Ask it rather than re-deriving the rule.
`RetryOptions.next(attempt, error)` lets a callee skip ahead (never back); the skipped attempts are
spent.

## A refused answer is GUIDED into the next attempt

A model that does not know why its answer was refused tends to give it again. After an attempt is
refused for its OUTPUT — the `filter` returned `null` or threw, or `invoke`/`request` failed the
schema — the call's `guide` (on `ask`, `talk`, `invoke`, `request`) receives `{ error, attempt,
output }` and answers the messages the NEXT attempt appends after the caller's own (a string is a
user message). The latest refusal's guidance replaces the previous one; the input is prepared afresh
with it, so the tail and the JSON/tool directives still close the final message, and every cached
prefix holds. A stalled stream, an empty answer and a fatal error never reach a guide.

A schema refusal is an `LlmSchemaRejection`: `validation-failed:` and the first three errors in its
message, EVERY Ajv error on `details` (Ajv runs with `allErrors`), the first on `cause`. When no guide
corrects it — no guide, a guide answering `null`, a guide that throws (logged) — the next attempt gets
the DEFAULT CORRECTION: up to eight errors with path, rule (missing property, allowed values, the
Ajv message) and the refused fragment at that path (JSON, ≤ 600 chars), then "Return the whole answer
again, corrected…". A filter refusal with no guide (or `null`) is asked again unguided — explaining it
is the caller's.

A filter that can name the defect throws `LlmOutputRejection(reason, details)` — retryable, the same
`filter-rejected:` prefix — and its guide reads `error.details`:

```ts
await model.invoke(input, schema, {
  action: 'name-sections',
  filter: answer => {
    const bad = offendersOf(answer)
    if (bad.length > 0) throw new LlmOutputRejection('non-latin-names', bad)
    return answer
  },
  guide: ({ error, output }) => error instanceof LlmOutputRejection
    ? correctionOf(error.details, output)
    : null, // a schema refusal then gets the default correction
})
```

## The same schema refusal twice leaves the rung

A refusal's signature is every distinct `instancePath|keyword|missing-or-allowed`, sorted. When an
attempt that was already sent with a correction comes back with the SAME signature as the previous
attempt on the same rung, the call stops asking that model: it jumps to the next fallback rung's first
attempt (each rung gets its own pair), and on the last rung it ends — pruned (below) when enabled,
else `LlmRetryExceededError('repeated-refusal')` with the refusal as `cause`, fatal for that call's
loop only (the caller's own `fatal` is asked first). A role with no fallback therefore stops after two
identical refusals instead of eight. `invoke` and `request` both stop; different refusals keep asking
until the retries run out (`max-retries`).

## Pruning is opt-in, on `invoke`

`LlmModelOptions.prune: true`: when an `invoke` is about to end on a schema refusal (the repeat stop on
the last rung, or the last attempt), the refused answer is pruned along each error's instance path in
the ROOT schema (a `required` or `additionalProperties` error starts at the property's own path):
deepest first, a `nullable` node (or one allowing type `null`) is set to `null`, else a key its object
does not require is deleted; an `anyOf`/`oneOf`/`allOf` node goes as a whole; an array item is never
pruned, nor anything holding one. Any error without such a node — no pruning. The caller's `filter`
then runs AGAIN on the pruned copy (it may refuse or amend it), and only a valid result is accepted,
reported as a `pruned` notice with the paths. Not "salvage": that word means JSON recovered from prose.

## Ladder notices

`LlmSpectator.notice?(event)` hears what happens INSIDE the retry ladder — `LlmSpectatorNotice
{ action, kind, attempt, reason?, signature?, paths? }`, `kind` an `LlmNoticeKind`: `rejected` after
every refused attempt (`reason` = `filter-rejected[:<reason>]` or `validation-failed:<path> <rule>
<detail>` — never the model's content), `stopped` on a repeat stop (`next-rung` / `last-rung`),
`pruned` with the pruned paths, `resumed` when the attempt's OpenAI background stream was dropped and
resumed or completed from the stored response (`reason` = `after:<sequence>`, the last event
delivered before the drop). Best effort: an observer
that throws or rejects is logged and never changes the call.

## Terminal failure observation

`LlmSpectator.error?({ action, error })` is a best-effort terminal observation hook. `makeLlmModel`
calls it once only after the entire retry ladder for `ask`, `talk`, `invoke`, or `request` has failed;
it never sees transient attempts and a failing observer never replaces the original error. Use it for
side-channel effects that must follow a confirmed stop (for example, a tenant notification), not for
retry control or persistence that the call itself depends on.
