---
name: testing
description: The package's specs — real local fixture sites, a real llm-reader, recorded registry facts for the inspector, a fixture search port, the scripted model double behind real llm models, the directory store; what each spec covers; the gated live spec.
metadata:
  purposes: test
  mentions: WEB_RESEARCH_LIVE, ANTHROPIC_SECRET, OPENAI_SECRET, scriptedResearch, fixtureSearch, packageInspector, startArticles, startProductSite, startDocsSite, startDesignSite, startCdn, live.spec.ts
---

# @owlmeans/web-research — Tests

`bun test ./tests` in the package (category C: the live spec reaches real search and the public web
behind a gate). Build first; specs import the built sibling packages.

- **No new mocks.** `tests/servers.ts` starts REAL sites on 127.0.0.1 (articles with one page carrying
  a hidden order and a 404, a product site with robots.txt closing `/admin` and a page with an
  injected comment, a package documentation site, a designed landing page with a cross-origin web
  font from a CDN origin); `localReader()` is a real `createLlmReader({ allowHosts: ['127.0.0.1'] })`.
- The model is `@owlmeans/agent`'s scripted double (`tests/_tools/model.ts`, copied) behind a REAL
  `makeLlmModel` (one attempt), wrapped by `createResearchModels` — `scriptedResearch(script)`; a
  structured answer is a tool call (`answer({...})`), an `error` turn fails the call. `turns()` counts
  model calls — the resume specs assert on it.
- `fixtureSearch(answers)` answers each query with recorded citations and sources (real local URLs);
  `packageInspector(docsUrl)` is a real `createPackageInspector` over recorded registry facts
  (`tinydate` genuine with the docs site as homepage, `tinydaet` its lookalike).
- Specs: `screen` (every signal kind, `kind: html`, strong signals, the judge's verbatim-quote rule),
  `implementation` (end to end, resume after a failed synthesis repeating nothing, a crash with no
  run store caught by the durable records, no search), `project` (robots, a dropped page, a judge
  that drops, a judge that clears), `design` (URL → reference with marks apart, a caller's bundle in
  place with the facts fallback, the analyzer alone with every server stopped), `packages` (verdicts,
  readme + docs crawl, notes for the genuine package only, no inspector), `skill` (validator faults,
  normalize, a repair round, notes researched through the composed packages run, a repair that fails).
- `live.spec.ts` (`WEB_RESEARCH_LIVE=1` plus `ANTHROPIC_SECRET` — `claude-haiku-5-5` — or
  `OPENAI_SECRET` — `gpt-5.4-mini` — from the repo-root `.env`): `research:implementation` ("lead
  scoring best practices for B2B CRM", 2 searches, 3 pages, the shipped judge) and `research:project`
  on https://twenty.com (5 pages), printing the outputs; it self-skips without the gate.
