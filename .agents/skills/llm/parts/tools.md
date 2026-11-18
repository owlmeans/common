---
name: tools
description: Look tools inside ONE ask or invoke call (LlmCallTools) — rounds within an attempt, stop tools that end the call with a caller-supplied value, the round budget and the answer-now turn (tool-less for ask), invoke's re-ask with the output tool pinned, what a retry carries, parallel calls whose streamed arguments were lost (toolCallsHelper), the plain call on a rung without tools, spectating and cache marks per round, and continuing the conversation through ref.conversation.
metadata:
  purposes: agent
  mentions: LlmCallTools, LlmStopTool, LlmToolConversation, RefferedResult, DEFAULT_TOOL_ROUNDS, toolCalling, maxRounds, exhausted, onToolCall, tool_choice, loopCache, makeRoundsUtils, toolCallUtils, toolCallsHelper, toolCallsOf, parseArguments, FINAL_TURN_REASKS, OUTPUT_TOOL_REQUIRED, TOOL_ROUNDS_NOTE_HEADER, CARRIED_LOOKUPS_HEADER, parallel tool calls
---

# @owlmeans/llm — Look tools inside one call

`ask` and `invoke` take `tools?: LlmCallTools<T>`. The call becomes ONE bounded conversation: the
model may read before it answers, and everything the call has without tools stays — the retry ladder
with its fallbacks and growing output budget, `filter` and `guide`, `ref`, `stable`, focus and skills
in the Tail, cache marking, the spectator. Use it for a call that writes or describes one artifact
and may need a file, a type or a design slice it was not given. A free-running agent with its own
plugins, inbox and stop is `@owlmeans/agent`; this is a model call that may look first.

Without `tools` nothing changes: `tests/tool-golden.ts` pins the requests of tool-less calls byte for
byte, recorded before the option existed.

```ts
// ask: write a file, or say it needs no change
const text = await model.ask(messages, {
  action: 'write-file', filter, guide,
  tools: {
    tools: [readFile, findType],                          // LangChain StructuredTools — they run
    stop: [{ name: 'keep', description: 'The file needs no change.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
      value: () => UNCHANGED_SOURCE }],                   // ends the call; no filter, no schema
    maxRounds: 3, exhausted: () => budget.spent(), onToolCall: name => meter.read(name),
    action: 'hybrid:screen:expand',
  },
  ref,
})
// invoke: look first, then answer through the output tool
const design = await model.invoke(input, DesignSchema, { action: 'describe', tools: { tools: [readSlice] } })
```

## One attempt

| Turn | Tools bound | `tool_choice` | What ends it |
|---|---|---|---|
| look (while rounds remain and `exhausted()` is not true) | look + stop (+ the output tool for `invoke`) | `ask`: none sent; `invoke`: `any`, or `auto` for a model that refuses a forced tool (`pinsTool` false) | a look call runs → next turn; a stop call or an output-tool call ends the attempt; a text answer ends `ask`'s, and `invoke`'s when it parses as a JSON object — else it is asked again pinned (below) |
| spent — only when stop tools exist | the same | as a look turn | a stop call or an answer ends it; a look call is not run → final turn |
| final, `ask` | **none** — the plain request | none | the answer; calls only (and no text) → asked again tool-less, at most `FINAL_TURN_REASKS` times, then the null diagnosis |
| final, `invoke` | look + stop + output | the output tool pinned (`plugin.toolChoice`) | the answer; look calls only → answered "not run" and asked again pinned, then the null diagnosis |

- `invoke` answered in words — no output-tool call and no JSON object in the text (a provider that
  ignores a forced `any` choice lets the model do that) — is not refused: the words stay in the turn,
  `OUTPUT_TOOL_REQUIRED(toolName)` follows them, and the next turn pins the output tool by name, which
  every provider honours. Re-asks inside one attempt are `FINAL_TURN_REASKS` in total, shared by this
  and the look-calls-only re-ask; past it the turn's answer goes to the usual path.

- `ask`'s final turn binds NO tool: a model may keep calling tools under `tool_choice: 'none'` (seen
  through a proxy), and no provider may be handed tool messages without their tools. It is prepared
  afresh (`host.prepare`, the call's usual path): the caller's input, every look-up of the call as ONE
  note (`TOOL_ROUNDS_NOTE_HEADER`, then `### tool {args}` and its result), the guidance, then the
  "answer now" message. A stop tool is callable only on the spent turn; on the tool-less turn a
  caller that keeps reads its own "no change" wording (the coder maps a declined edit to its marker).
- A retry whose `exhausted()` is already true answers at once: `ask` straight to the tool-less turn,
  `invoke` straight to the pinned turn — no spent turn, no look-up.
- The turn after the last look round carries one short "answer now" user message.
- A turn's calls are `toolCallsHelper.messageOf(piece, plugin)`'s: langchain joins a streamed call's
  argument fragments by position, and a stream whose fragments carry none (parallel calls through a
  proxy) leaves every call `{}`; the provider's own record (`LlmPlugin.toolCallsOf` — OpenAI's
  `response_metadata.output` function calls) rebuilds them by call id, else the chunks are regrouped in
  stream order. No call is dropped; ids are kept; a recorded call whose arguments do not parse is left
  to its streamed form. The plain `invoke` reads its output tool's arguments through
  `toolCallsHelper.reconcile` too, and `@owlmeans/agent`'s loop and any hand-rolled loop over `stream`
  use the same helper. A new provider plugin whose API repeats the finished calls beside the stream
  answers `toolCallsOf` with them.
- Look calls of one turn run in parallel, each contained (`toolCallUtils.run`): a thrown error
  becomes the tool message's text (`status: 'error'`); an error `retryHelper.isFatalError` names
  fatal — the call's own `fatal` first, then the registered resolvers and plugins — ends the call. An
  unknown name is answered as not found.
- A stop call wins over everything in its turn: `value(args)` is the call's answer, bypassing
  `filter`, `guide` and `invoke`'s schema. An output call wins over look calls.
- The answer goes through the call's usual path unchanged: the empty-output null diagnosis,
  `filter`, `guide`, coercion and validation (`invoke`), `notifyRef`.
- `invoke` on a conversing rung always answers through the output tool; `schemaPlacement: 'tail'`
  applies to a rung that takes the plain call.
- Two tools of one name (look, stop, output) are refused with a fatal `LlmMissconfiguredError` before
  any request.

## Retries carry the look-ups

`maxRounds` is per attempt; a retry (a filter or schema refusal, a null result, a stalled stream)
never runs a look-up again:

- the same rung: the earlier rounds go out again as the messages they were, right after the opening
  (same preparation, so the cached prefix holds through them), then the guidance — except on `ask`'s
  tool-less turn, which carries them as the note;
- another rung (a fallback, another provider) or a rung without tools: every earlier look-up travels
  as ONE note in the input (`CARRIED_LOOKUPS_HEADER`, then `### tool {args}` and its result), prepared
  with the guidance after it — no provider block or tool pairing crosses rungs.

## Who converses

A rung converses when its client has `bindTools`, its plugin does not answer `toolCalling(config)`
with `false`, and there is something to declare (`invoke` always has its output tool; an `ask` with
no look and no stop tool takes the plain call). Any other rung takes the plain call — the tools are
ignored. `ref.conversation.tooled` says which happened, for metering.

## Spectator and cache

- Every model turn is spectated as its own entry (usage per round): turns that ran look-ups under
  `tools.action` (default: the call's `action`), the answering turn under the call's `action`.
  `ref.spectatorEntry` is the answering turn's.
- Every turn streams under the same idle deadline.
- The first turn of a first attempt is the plain request exactly, with tools declared: the markers
  `patchPrompt` placed, no extra write for a call that ends without looking. Every later turn sends the
  unmarked opening plus what followed it through the rung's `loopCache(wire, model, hints)` — the hints
  (system blocks, project message index, lifetimes) come from the same preparation — so the system and
  project marks stay and each round reads back the one before. `cacheMax: 0` sends the rounds with no
  marker; `PromptPolicy.cacheSystem: false` with the caller's `stable` mark only. Tool schemas are part
  of the request and ride the cached prefix: keep a tool set stable across calls. `ask`'s tool-less
  final turn is a plain request marked by `patchPrompt`: it shares the persona's tool-less prefix, not
  the conversation's.

## Continuing a conversation

On success, `ref.conversation: LlmToolConversation { tooled, rounds, stop?, messages }` is set before
`ref.value` and the callback. `messages` are provider-neutral: the caller's input, an earlier attempt's
look-ups (as messages or the note), the guidance, the rounds (assistant text + tool calls, then their
results), the "answer now" turn, and the answer as the model gave it — before the filter; `invoke`: its
coerced JSON as text — or the stop call and its acknowledgement. Never the composed system prompt or the
Tail. Continue with `ask([...conversation.messages, nextTurn], { tools, … })`: the same composition is
put around it and the Tail goes on the new final message.
