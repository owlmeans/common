---
name: inquiry
description: The human-in-the-loop primitive — one question put to a person while a run is in flight. Covers the llm-common contracts (Inquiry, InquiryAnswer, InquiryPolicy, the one answer ceiling), the llm transport registry and ExecutionService.ask, the executionInquiry bridge, the agent ask_user plugin, and the pipeline Waiting/resume path. Use when a run needs a decision that is not its own, when seating or releasing an inquiry channel, or when a run parked Waiting and nothing answered it.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Inquiry — asking a person mid-run

One question, put to whoever is behind a run, answered in seconds or not at all. It is the only
supported way for an execution, an agent or a pipeline to obtain a decision that is genuinely not
its own — a missing sub-project, a choice between two products the code could be, a relocation
nobody may perform unasked.

It is deliberately NOT a form, a chat or a review queue: a question offers a choice, free text or a
yes/no, and a run that is not being watched must never block on one.

## Where each half lives

| Layer | Package | What it owns |
|---|---|---|
| Contracts | `@owlmeans/llm-common` (`src/inquiry/`) | `Inquiry`, `InquiryAnswer`, `InquiryOption`, `InquiryTransport`, `InquiryConfig`, `InquiryKind`, `InquiryPolicy`, the constants, and the pure helpers |
| Runtime | `@owlmeans/llm` (`src/inquiry/`) | The transport registry, `InquiryError`/`InquiryUnavailable`/`InquiryDeclined`, `executionInquiry`, and `ExecutionService.ask` |
| Pipeline | `@owlmeans/agent-common` | `PipelineRunStatus.Waiting`, `PipelineRunInquiry`, `INQUIRY_ANSWERS_KEY`, `PipelineNotResumableError` |
| Runner + tool | `@owlmeans/agent` | `PipelineRunContext.ask`, the `inquiry` stop reason, the answers merge, `inquiryPlugin` / the `ask_user` tool |
| Wire | `@owlmeans/viable-common` (`src/connect/`) | The connector's own copy — `ConnectInquiryKind`, `InquiryPayload`, `InquiryAnswerPayload` — renamed so both vocabularies can be imported into one file |

## The contracts

```typescript
enum InquiryKind { Choice = 'choice', Text = 'text', Confirm = 'confirm' }
enum InquiryPolicy { Ask = 'ask', Default = 'default', Refuse = 'refuse' }

interface Inquiry {
  id: string                    // chosen by whoever asks; the ONLY thing that routes an answer back
  kind: InquiryKind
  question: string              // one question, in plain words
  context?: string              // one or two sentences of background — never the whole task
  options?: InquiryOption[]     // required for Choice, ignored otherwise
  multiple?: boolean
  allowText?: boolean           // a Choice the answerer may answer in their own words instead
  default?: string | string[]   // what to assume when nobody answers
  expiresAt?: string
}

interface InquiryAnswer {
  inquiryId: string
  value?: string | string[]
  text?: string
  declined?: boolean            // nobody could decide — an ANSWER, never a failure
  truncated?: boolean           // set by capAnswer or stateAnswerOf, never by an answerer
}

interface InquiryTransport { ask: (inquiry: Inquiry, signal?: AbortSignal) => Promise<InquiryAnswer> }
interface InquiryConfig { transport?: string; policy: InquiryPolicy }
```

The pure helpers are the ONE reading of an answer every layer uses — a second reading is a second
contract: `defaultAnswerFor(inquiry)` (the default, or a decline), `answeredWith(answer)` (the first
value, else the text, else `null`), `isDeclined(answer)`, `capAnswer(answer, max?)`,
`stateAnswerOf(answer)`, `renderInquiry(inquiry)` (a one-line label for a note or a run row).

## Three policies, and no fourth

`InquiryConfig` travels on `ExecutionState.inquiry` — serializable, and deliberately absent from
`COLLABORATOR_KEYS`, so a run resumed days later asks through the same channel under the same
policy.

| Policy | `ExecutionService.ask` does |
|---|---|
| `Ask` | Hands the question to the seated transport and waits for the answer |
| `Default` | Returns `defaultAnswerFor(inquiry)` and asks nobody. The caller is expected to RECORD the assumption where a user can read it |
| `Refuse` | Throws `InquiryDeclined` — nobody may be asked at all |

**No configuration means `Default`.** A run that was never given a channel must never block on one:
that is what makes the primitive safe to reach for from code that also runs unattended (a web
project pipeline, a scheduled job).

## One ceiling, referenced rather than restated

`DEFAULT_INQUIRY_ANSWER_CHARS` (2 000) is the only ceiling on a stored answer. The connector's
`CONNECT_INQUIRY_MAX_TEXT` equals it, the connector's answer schema caps `text` at it, and
`capAnswer` enforces it. Three ceilings for one value is how a user's 3 000-character answer is
accepted on the wire and silently halved further in — so never introduce a local cap; import this
one.

**Only the prose is ever cut.** A `value` is the decision itself — for a `Choice` it must equal one
of the question's own option values — so a shortened one is not a degraded answer but a different
answer, matching no option, which `answeredWith` would hand on as what the person chose. An
over-long `value` is a defect upstream (the connector's schema refuses one rather than shortening
it): `capAnswer` passes it through whole and raises `truncated` on it.

`capAnswer` **reports** the cut (`truncated: true`). A silent truncation is exactly the class of
failure the primitive exists to prevent.

A resumable pipeline **state** stores less: `stateAnswerOf` keeps the decision whole and cuts the
prose to `INQUIRY_STATE_TEXT_CHARS` (200), because a state is keys, markers and paths — two
full-size answers would make it prose. The full answer still goes back to whoever asked; long text
belongs in whatever document the application keeps for it (the converter writes
`docs/conversion/inquiries.md`, keyed by inquiry id).

## The transport registry, and why an absent channel is fatal

```typescript
registerInquiryTransport(key, transport)   // seat on attach
releaseInquiryTransport(key)               // release when the channel goes away
hasInquiryTransport(key)
inquiryTransportFor(key | undefined)       // throws InquiryUnavailable — never waits
```

Module-level and keyed by string, exactly like the delegate-transport and provider-plugin
registries beside it: a process holds many at once, and an execution names the one its run belongs
to. It is `inquiryTransportFor`, not `transportFor`, because `@owlmeans/llm` and
`@owlmeans/llm-delegate` are re-exported into one namespace by `@owlmeans/viable`.

**A transport that cannot serve a question THROWS.** A declined answer is a decision; a channel that
is gone is terminal, and the two must never look alike.

`InquiryUnavailable` is registered fatal (`registerFatalError`) **beside the throw**, so no caller
has to remember: every retry ladder aborts at once instead of spending itself on a channel nobody is
behind. `InquiryDeclined` is deliberately NOT fatal — the run decides for itself and carries on.

## `ExecutionService.ask` and the one bridge

```typescript
const answer = await ctx.executions().ask(exec, inquiry)          // policy-driven, may throw
const ask = executionInquiry(service, exec)                        // (inquiry, signal?) => answer | null
```

`executionInquiry` is the ONE adapter that maps `InquiryUnavailable → null` and rethrows everything
else. Wire a pipeline's `options.inquiry.ask` and an agent plugin's channel through it rather than
catching the error again: a consumer that folded a decline into the same `null` would turn "I will
not decide" into a run that parks forever, and one that folded them the other way would fail a run
because a browser tab closed.

It asks for the one METHOD it calls (`{ ask }`) and infers the execution type from the execution
handed to it, so a consumer's own service — `@owlmeans/viable`'s, instantiated with its own
`ViableExecutionShape` — passes with no type argument, and a facade or a test double stands in
just as well. Never make an adapter generic over the SHAPE instead: `S` appears in
`ExecutionService<S>` only through indexed accesses, which is not an inference site, so it silently
falls back to the bare `ExecutionShape` and refuses every real service contravariantly on `root`.

## The `ask_user` tool

`inquiryPlugin({ ask })` (`@owlmeans/agent`, alias `INQUIRY_PLUGIN`, order 45) adds the `ask_user`
tool and one Context paragraph. Both appear **only when `ask` is wired** — a tool nobody can serve
is a tool the model tries once and remembers as broken.

The body never throws, with exactly one exception: `InquiryUnavailable` is **rethrown**. No channel
is an answerable situation (`{ error: 'Nobody can answer …' }`); a channel that WAS there and
vanished is not. That escape only works if the agent passes `fatal: e => isFatalError(e) != null`
into `safeInvokeTool` — **an agent installing this plugin must**, or the loop spends its whole turn
budget on a dead channel.

## Parking a pipeline: `Waiting`

`PipelineRunContext.ask(inquiry)` has three outcomes, in order:

1. An answer already in the state (a resume) is returned at once — a question is never asked twice.
2. A live channel answers: the answer is recorded in the state (`stateAnswerOf(capAnswer(...))`
   under `state[INQUIRY_ANSWERS_KEY][inquiry.id]`) and the FULL answer is returned.
3. Nobody is there: the run stops `Waiting` with the inquiry on its row, and the call never returns.

**`Inquiry.id` must be stable across re-entries of the same step.** It is the only thing an answer
is matched by, so derive it from the step and the thing being decided (`${step}:${entity}:tone`) —
never mint one per call. A fresh id can never match what the state holds, so the run asks again on
every entry and parks forever, which is the one way to break the asked-once contract from inside.

A `Waiting` run is resumable and **not stale** — it has no process, and its heartbeat will not move
again until somebody answers, so nothing that sweeps stale runs may pick it up. A run with no store
cannot park at all: it throws `PipelineNotResumableError`, because nothing would be there to resume.

Answers are merged **by the runner**, in both `invoke` and `resume` (`resume(runId, { answers })`),
never by a caller's mapping: the seed overwrites the restored state key by key, so a mapping that
forwarded the answers map would wipe the child's own recorded answers. The merge applies the same
`stateAnswerOf(capAnswer(...))` cut the live path does — a resume is how an answer usually arrives,
so a ceiling enforced on the live path alone is enforced where the least text comes in. Answers are
also the one state key that ACCUMULATES, so `ctx.ask` re-reads the map at write time: steps with no
edge between them run in one superstep, and a write built from a pre-await copy loses a sibling's
answer. When a composed child parks, `asStep` asks the parent's `ctx.ask` and re-invokes the child
if an answer comes back (bounded); only when the parent's own `ask` parks does the parent park too.

## Rules

- Ask only for a decision that is genuinely a person's. Anything discoverable by reading is not a
  question.
- One question at a time, with a `default` wherever one is defensible — most runs answer themselves
  under policy `Default`, and a question with no default costs them a decline.
- Never widen a `Choice` past `DEFAULT_INQUIRY_OPTIONS` (12); beyond that it is not a question.
- Never introduce a second answer ceiling, a second reading of "was this answered", or a second
  mapping of `InquiryUnavailable`.
- A refusal a user can act on must be phrased for them — a raw `inquiry:declined:<id>` reaching a
  screen is a bug in the consumer, not in this primitive.

## Related

- [[llm-common]] — where the contracts live · [[llm]] — the registry and `ExecutionService`
- [[llm-delegate]] — the same registry/fatal shape for model calls performed elsewhere
- [[agent]] — the pipeline runner and the `ask_user` plugin · [[agent-common]] — the run contracts
