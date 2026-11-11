---
name: analysis
description: The model-backed reading of a page — describe (the default Markdown description), classify, extract in text, DOM (an @owlmeans/agent agent) or auto mode, links by intent, pictures with their role, usage and vision captions — and the page model they read (metadata evidence, content, signals, the DOM index).
metadata:
  purposes: agent, data
  mentions: makePageAnalyst, makeReaderModels, ReaderModels, ReaderMode, ReaderTask, PageDescription, PageClassification, ExtractResult, Evidence, SelectedLink, PageImage, ImageRole, makePageModel, PageModel, DomIndex, PageSignals, MetaValue
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm-reader — Analysis

## The page model

`makePageModel({ url, html, fetched?, rendered? })` — every member lazy, computed once:

- `meta()` — title, description, author, published, modified, site, each a `{ value, source }` with
  its evidence (`json-ld` > `open-graph` / `meta` > `markup` > `content`), plus language, canonical,
  image, favicon, `ogType`, every JSON-LD `@type`, feeds.
- `content()` — Markdown. An article-shaped page (an `<article>`, or a long main text without
  repeated cards) goes through Defuddle; anything else, or an article Defuddle reads under 150 words
  from, is rendered section by section with turndown (`method: 'article' | 'structure'`).
- `links()` — `{ url, text, rel, region, section, internal, kind, order, ref }`; text is
  block-aware (a card's heading and its label do not run together).
- `images()` — every picture with its context: source (`img` with `srcset` and lazy `data-*`
  candidates, `<picture>`, inline `svg`, CSS background, `og:image` / `twitter:image` / JSON-LD,
  icons, video posters, merged by URL into `origins`), alt, size, loading, decorative flag, caption,
  wrapping link, region, nearest heading (a card's own heading wins), nearby text, `inMain`, and a
  deterministic `hint` (logo, hero, avatar, icon, thumbnail, background, tracking).
- `signals()` — word counts, headings, links, forms, password and search fields, prices, repeated
  card groups, app shell, `<article>` / byline / `<time>`, calls to action.
- `dom()` — refs (`n12`) in document order: `outline(ref?, depth, budget)`, `query(selector)`,
  `find(text)`, `node`, `text`, `selector(ref)`.

## Models

`makeReaderModels(exec, { executions, roles?, spectator? })` refines one helper execution per
`ReaderTask` (role `reader` unless mapped) and builds its `LlmModel` from it — the helper IS a
complete set of model options, so prompt policy and spectator follow the run. DOM mode needs the
helper (the agent is built over one); a bare `LlmModel` serves text mode only.

## Modes

Every task — `describe`, `classify`, `extract`, `links` by intent, picture roles — is a JSON schema
plus an instruction, and takes `mode`. **DOM mode is the default** whenever the reader has a helper
execution for the task (`makeReaderModels`); a reader on one bare `LlmModel` reads in text mode. An
explicit `mode` always wins, and `ReaderMode.Dom` without an execution is a `ReaderConfigError`.

- **DOM** (the default): `makeAgentModel` (lazy-imported with its LangGraph peers) with `dom_outline`,
  `dom_query`, `dom_find`, `dom_expand`, `dom_text` and `submit`. Besides the DOM the agent is told
  the markup facts (Open Graph and Schema.org types, the signals) and, for tasks that answer by picture
  id, the image list with each picture's DOM ref — the ids are the package's, not the page's. Every
  tool reports a malformed call with its details (`verboseParsingErrors`), so the agent can fix it.
  `submit` validates the result against the task schema, then runs the task's own check (picture roles
  must cover every listed picture) — either rejection goes back as text — and takes evidence
  `{ ref, quote }`, kept only where the quote is in the node's text. An agent that runs out of turns
  has its notes handed to one text call. URLs it quotes as the page wrote them are resolved against
  the page before they are matched.
- **Text**: one `invoke` over the page's reading pack — metadata with evidence, signals, the outline,
  the main content (cut with a note at its share of `budget`, default 60 000 characters), the link and
  picture inventories. The pack is the first user message with `stable: 1` and the task the last, so
  several text-mode tasks on one page share the provider's prompt cache. No system message: personas
  come from the execution's prompt policy. Cheaper and faster than DOM mode; ask for it with
  `mode: ReaderMode.Text`.
- **Auto**: text first; a required field left empty sends it to the DOM agent.

Schema property names avoid JSON-Schema keywords (`format`, `pattern`, `default`, `contains`, …):
OpenAI hides such a property from the model, and `@owlmeans/llm` refuses the schema before any call.

## Tasks

- `describe({ mode?, content: 'full' | 'summary' | 'none' })` — the model fills title, type,
  summary, structure blocks, key links and image roles; the package renders `# Title`, a facts line,
  `## Summary`, `## Structure`, `## Key links`, `## Images` and `## Content` (the deterministic
  Markdown — long articles are never retyped by the model). Invented URLs and ids are dropped.
- `classify({ mode? })` — `{ pageType, confidence, reasons }` over `PageType`.
- `extract({ schema?, instruction?, mode? })` — `{ data, mode, evidence }` (`mode` = the one that
  answered, `evidence` filled in DOM mode); without a schema the answer is `{ result: Markdown, urls }`.
- `links({ intent?, limit?, mode? })` — without an intent the page's links; with one, those the model picks,
  matched back to the page's own links (with their region, kind and section) and its reason.
- `images({ classify = true, vision = false, visionLimit = 4, skipTracking = true, key?, mode? })` — the
  inventory, plus each picture's `role` and one-sentence `usage` from one call; `vision` captions the
  most informative pictures (hero, illustration, photo, product, chart …; never icons, logos,
  avatars or tracking pixels), fetched through the same fetcher and key, sent as checked
  `mediaHelper.image` parts the model's provider plugin spells (JPEG/PNG/WebP/GIF ≤ 4 MB, four per
  call; a picture whose bytes are not its type is skipped). It needs a vision model —
  `ModelConfig.vision` — and is refused with `ReaderConfigError('no-vision-model')` before any call
  otherwise.
