---
name: screening
description: The deterministic hidden-instruction signal pass, what kind html changes, strong vs weak signals, the judge port and the shipped judge, and what a dropped, flagged or cleared source looks like.
metadata:
  purposes: agent, data
  mentions: injectionSignalsHelper, createInjectionSignalsHelper, InjectionSignalKind, InjectionSignal, InjectionSignalOptions, STRONG_SIGNAL_KINDS, HTML_INERT_BLOCKS, ResearchScreen, makeResearchJudge, ScreenVerdict, ScreenTextKind, JUDGE_INSTRUCTION, source-screened, source-flagged
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-research — Screening

## The signal pass

`injectionSignalsHelper.signals(text, { kind?, hidden? })` is pure and needs no model:

| Kind | Fires on |
|---|---|
| `invisible` | any Unicode tag character (the decoded tag text is in the excerpt), or more than `INVISIBLE_NOISE` (2) zero-width / invisible operators |
| `bidi` | bidirectional embeddings, overrides and isolates |
| `hidden-comment` | ≥ `HIDDEN_PROSE_WORDS` (6) words inside an html comment or a markdown comment idiom |
| `hidden-element` | ≥ 6 words inside an element with `hidden`, `aria-hidden="true"` or a style that draws nothing (`display:none`, `visibility:hidden`, zero size/opacity, white or transparent text) |
| `hidden-run` | each `hidden` string of ≥ 6 words (a format's hidden runs) |
| `addressed-to-ai` | text addressed to an AI, an assistant, a model or an agent ("Note to AI agents reading…", "If you are an AI…") |
| `override` | "ignore previous instructions", "new instructions:", "you are now…", "system prompt", "answer only with", "do not tell the user" |

Each signal appears once (`kind` + excerpt, at most `SIGNAL_EXCERPT_CHARS` (240) characters).
Without `kind` the text is read exactly as given — keep that path's output stable: other screeners
reuse it for raw document text with its `hidden` runs.
`kind: ScreenTextKind.Html` first removes `<script>`, `<style>` and `<template>` blocks
(`HTML_INERT_BLOCKS`): no reader of the page sees them, and site bundles quote prompt words in code.
`readable(text, kind)` is that text — what a judge is shown.

## Deciding

| Signals | No judge | Judge wired |
|---|---|---|
| none | `clean` | `clean` (no call) |
| any strong (`STRONG_SIGNAL_KINDS`: `override`, `addressed-to-ai`; `wiring.strongSignals` overrides) | `dropped` | one judge call: injected ⇒ `dropped`, else `clean` |
| weak only | `flagged` (kept, `source-flagged` gap) | one judge call, as above |

A judge that throws decides nothing: the no-judge rule applies to that source. A dropped source's
files are removed at once; its record keeps the verdict, the signal kinds and the reason
(`source-screened` gap). Counters on the state: `kept`, `dropped`, `flagged`, `judged`.

## The judge

`ResearchScreen.judge(text, signals, { url, title?, purpose })` → `{ injected, reason?, quote? }` is a
port. `makeResearchJudge(models, { maxChars? })` is the shipped one: ONE `ResearchRole.Judge`
structured call (`InjectionAnswerSchema`: `injection`, `quote`, `reason`) under `JUDGE_INSTRUCTION`
(pages about AI, quoted prompt examples and hidden menus are not injections), the source capped at
`judgeChars`, at most `SIGNALS_SHOWN` (12) signals listed. `injected` is true only when the quote is
found in the source (whitespace and case ignored) — an order the page does not hold is the model's.
On the public web most pages carry weak signals (hidden menus, comments): with a judge they cost one
call each and come back clean.

## Changing the pass

- A new signal kind is a value of `InjectionSignalKind`, its pattern constant exported beside the
  others, and a case in `screen.spec`; decide whether it is strong (`STRONG_SIGNAL_KINDS`) — a strong
  kind drops sources without a judge, so it must not fire on ordinary pages.
