---
name: retries
description: The idle stream deadline, passing an outer attempt into the escalator, isFatalError for loops above the model, and the terminal failure observation hook.
metadata:
  purposes: agent
  mentions: MODEL_STREAM_TIMEOUT_MS, streamTimeout, escalation, LlmCallOptions, retryHelper, isFatalError, withRetry, FALLBACK_AFTER_ATTEMPTS, LlmSpectator
---

# @owlmeans/llm — Deadlines and retry loops

## Hangs are bounded by an IDLE deadline, not a total one

A stalled provider is aborted after `MODEL_STREAM_TIMEOUT_MS` (3 min) of SILENCE and surfaces as a
retryable `LlmModelError`, so the escalator moves on. Stream creation and each iterator read race
an independently rejecting deadline; forwarding an abort signal alone does not bound an SDK
promise that ignores cancellation. Late values never reach the caller, late failures are observed,
and best-effort iterator cleanup never delays timeout, terminal chunks or consumer cancellation.
The timer re-arms on every token, so a
long-but-productive generation is never cut off — which is why the value can be low. Set it for a
deployment with `LlmServiceOptions.streamTimeout` where the application composes its context; a
preset naming its own `ModelConfig.streamTimeout` keeps it. It does NOT bound a call that keeps
streaming forever, nor retries — a fatal error misclassified as retryable multiplies its own latency
by `DEFAULT_MODEL_RETRIES`.

## An outer validation loop must pass its attempt in

A caller that validates the OUTPUT — a diff that has to apply, a file that must not come back
truncated — runs its own retry loop around whole `ask` calls. Every one of those calls starts a FRESH
inner loop at attempt 0, so the escalator's two rungs never move: same model, same output budget,
same deterministic answer, N times. Pass `escalation: <outer attempt>` in `LlmCallOptions` and the
per-call escalator starts that far up its ladder instead — `maxTokens` doubling and the
`FALLBACK_AFTER_ATTEMPTS` switch to `ModelConfig.fallback` both advance. It is clamped to
`retries - 1`, moves the STARTING rung only, and never changes how many attempts the call makes. The
model switch depends on preset data rather than code: the role must declare a `fallback`.
`LlmCallOptions.fatal` is the lever
in the other direction — a per-call resolver consulted before the global ones and the plugin's
`isFatal`, for an error the caller knows no retry can fix.

### A loop ABOVE the model asks the same question with `retryHelper.isFatalError`

A retry loop is not the only place that decides to carry on: a fix ladder rescues a failed repair and
climbs to a stronger model, an agent runner catches a round that threw and reports "gave up". Both
are right for a model that answered badly and wrong for a budget that ran out, and a blanket `catch`
cannot tell them apart — an exhausted balance becomes more expensive calls instead of a halt.
`retryHelper.isFatalError(e, fatal?)` runs the same resolvers, in the same order, that `retryHelper.withRetry` uses, and
returns the error to abort WITH (a resolver may unwrap a carrier and hand back the real cause) or
`null` when nothing considers it terminal. Ask it rather than re-deriving the rule.

## Terminal failure observation

`LlmSpectator.error?({ action, error })` is a best-effort terminal observation hook. `makeLlmModel`
calls it once only after the entire retry ladder for `ask`, `talk`, `invoke`, or `request` has failed;
it never sees transient attempts and a failing observer never replaces the original error. Use it for
side-channel effects that must follow a confirmed stop (for example, a tenant notification), not for
retry control or persistence that the call itself depends on.
