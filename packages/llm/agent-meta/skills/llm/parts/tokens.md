---
name: tokens
description: Token counts and budgets — the o200k tokenizer behind the @owlmeans/llm/tokens subpath, the fast estimate, and fitting prioritized parts (a prompt, specification files) into a budget with paragraph and sentence trims and explicit omission markers.
metadata:
  purposes: agent, data
  mentions: tokenBudgetHelper, createTokenBudgetHelper, TokenBudgetPart, TokenBudgetFit, TokenBudgetEntry, TokenBudgetStatus, TokenBudgetFitOptions, TOKEN_BUDGET_SEPARATOR, gpt-tokenizer
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm — Token budgets

## Import it from the subpath

```ts
import { tokenBudgetHelper } from '@owlmeans/llm/tokens'
```

The root exports only the types and the vocabulary (`TokenBudgetStatus`, `TOKEN_*`): the o200k tables (`gpt-tokenizer`) take
0.1–0.4 s to load, which every process importing `@owlmeans/llm` would otherwise pay.

| Member | Does |
|---|---|
| `count(text)` | Exact o200k_base count — the encoding OpenAI's current models read. A special-token string (end-of-text and the like) is counted as the text it is, never thrown on. |
| `estimate(text)` | Character classes, no tokenizer: within about a fifth of `count` on prose, code, JSON, Cyrillic and CJK, leaning high. Never for a hard limit. |
| `within(text, budget)` | Whether the text fits; stops counting at the limit. |
| `fit(parts, budget, { separator?, marker? })` | The budget fit below. |

For an Anthropic or another model the count is an approximation: keep a margin under that model's
real window.

## `fit`

Parts are `{ id, text, priority, minTokens? }`. Priorities are placed highest first; a group whose
parts all fit stays verbatim. A group that does not fit shares what is left: a part under its fair
share stays verbatim (water-filling, smallest first), the rest split the remainder and are trimmed
to the head that fits — whole paragraphs, then whole sentences or lines of the next one — closed by
an explicit marker (default `\n\n[… <n> tokens of "<id>" omitted …]`). A part with no whole
sentence of room, or fewer than `minTokens` left, is dropped. Lower priorities get what remains.

The result is `{ budget, text, tokens, parts, kept, trimmed, dropped }`: `text` joins the kept and
trimmed parts in INPUT order with the separator (default `\n\n`), separators counted;
`tokens = count(text)` and never exceeds the budget — the joined text is counted once more and the
lowest priority gives way if a boundary added a token; each entry carries `status`, its fitted
`text`, `tokens` and the `original` count. The same parts always give the same answer: no clock,
no locale, ties broken by input order.

## External docs

- https://github.com/niieani/gpt-tokenizer — pure-JS BPE for OpenAI encodings; `gpt-tokenizer/encoding/o200k_base` exports `countTokens`, `isWithinTokenLimit` (early exit, `false` or the count); special tokens throw unless `disallowedSpecial` is emptied (4.1.1, 2026-11)
