---
name: agent-presentation
description: Shared, runtime-free taxonomy for presenting OwlMeans Viable agent output. Use when classifying LLM thinking/history messages, adding semantic structured-output cards, or changing their server-to-browser event contract.
---

# Agent output presentation

`packages/viable-common/src/agent/presentation.ts` owns the browser-safe vocabulary for agent output.
Keep the server and every client on `classifyAgentMessage()`; consumers may refine a provisional
classification as streamed text becomes parseable, but must not invent a competing taxonomy.

## Contract

- The top-level categories are code, unified diff, structured output, Markdown and plain text.
  Code and diffs carry one of React TSX, CSS, TypeScript, JSON or other; structured output carries
  a semantic kind; Markdown carries a document kind; every presentation carries a specialist role.
- Classify from the combined source: agent, helper, action, explicit output type, text and parsed
  value. Helper/agent attribution selects the specialist family; content shape alone is not enough.
- A transport may send `presentation` on thinking start and stop events. It is optional for rolling
  compatibility; the final server hint is based on complete output and the browser refines it while
  it streams. Keep legacy `outputType` intact.
- Unwrap a single LangChain tool call's `args` before semantic classification. Known schemas render
  as cards; unknown objects and arrays remain generic structured output, never raw JSON.
- `isAgentMessageHidden()` owns utility-run suppression. The source extractor's `source-extract`
  range-selection calls are internal context reduction and never render in thinking or history.

## Consumer rules

- Treat Markdown as a compact draft, not as a full document. Keep raw HTML disabled.
- Use one token renderer for code and diff code portions; infer a diff language from its changed path.
- Plain text remains plain. Empty live output is an activity state, not a fabricated model response.
- Labels for known structured fields belong to the consuming app's i18n resources. Open model keys
  should be humanized rather than passed through an unbounded translation namespace.

## External docs

- https://github.com/remarkjs/react-markdown/blob/main/readme.md — safe-by-default Markdown with custom React components.
- https://github.com/remarkjs/remark-gfm — GFM tables, task lists, autolinks and strikethrough plugin.
- https://github.com/FormidableLabs/prism-react-renderer — React token rendering for compact source views.
- https://fontsource.org/fonts/jetbrains-mono/install — self-hosted variable JetBrains Mono for Vite apps.
