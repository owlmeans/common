---
name: design
description: The reader's design analysis — measured facts (stylesheets parsed and weighted by the DOM, computed styles merged from a renderer), the model's draft, and the DESIGN.md the package renders (Google Labs spec plus Responsive Behavior and Agent Prompt Guide).
metadata:
  purposes: theme, agent
  mentions: makeDesignAnalyst, DesignFacts, DesignReport, DesignTokens, DesignDraft, renderDesignMd, DESIGN_SECTIONS, StyleSample, RenderedPage
---

# @owlmeans/llm-reader — Design

## Facts are measured

`reader.design(url)` (or `makeDesignAnalyst(page, { models, fetcher }).facts()`) fetches up to 10
linked stylesheets under the page's proxy key, adds `<style>` blocks and inline styles, and parses
them with css-tree. Every rule is weighted by how many elements of THIS page its selector matches
(states stripped), so a site-wide sheet or a utility framework says only what this page uses; a font
set on the root counts for every element it is inherited by. The facts:

- custom properties (from `:root` / `html` / `body`), with `var()` resolved everywhere;
- colors normalized by culori (`#rrggbb`, or `#rrggbbaa` when translucent), each with its weight as
  text / background / border / accent (links, buttons, states);
- the type scale per role (body, h1–h6, link, button, small, lead, price …), fonts by use, fonts loaded;
- spacing (rem → px), radii, shadows, breakpoints from media queries;
- component rules (button-primary/secondary, button, card, input, header, footer, nav, badge);
- key blocks top to bottom (header, hero, logos, features, pricing, testimonial, cards, form, footer).

A rendered page (`page.rendered`, from a `PageRenderer`) has its computed-style samples merged over
the parse — colors on screen, the type scale, radii and shadows (`source: 'both'`) — and its
screenshot goes to the model with the facts — only when the design model accepts images
(`capabilities().vision`); otherwise the facts alone. `reader.design` renders a URL first whenever a
renderer is configured; a local bundle (the `fetching` part) is measured and rendered the same way.

## The document is rendered, not written

The model fills `DesignDraft` — token arrays (`{ name, value, role }`, never free maps, so every
provider can be asked) and the prose of every section — grounded in the facts. `renderDesignMd`
then:

- slugs token names (lower-case kebab; `2xl` stays, an all-digit name is prefixed);
- keeps a color only if it parses, a dimension only in px/em/rem (a bare number becomes px), a
  numeric `fontWeight`, a unitless or dimension `lineHeight`;
- resolves component references (`{colors.primary}`) or drops them with a warning, and turns a
  literal equal to a palette color into a reference to it;
- guarantees a `primary` color (the most used accent when the draft named none);
- writes the YAML front matter itself — every scalar a JSON string or a bare number, valid YAML 1.2,
  no YAML library — with `version: "alpha"`;
- writes the sections in `DESIGN_SECTIONS` order: the spec's Overview, Colors, Typography, Layout,
  Elevation & Depth, Shapes, Components, Do's and Don'ts, then Responsive Behavior and Agent Prompt
  Guide (the spec preserves unknown sections; the linter raises no section-order finding).

`DesignReport` is `{ markdown, tokens, facts, warnings }` — `warnings` lists everything the renderer
corrected or dropped.

## External docs

- https://github.com/google-labs-code/design.md (docs/spec.md) — DESIGN.md (alpha): YAML front matter `name, description, colors, typography{fontFamily,fontSize,fontWeight,lineHeight,letterSpacing}, rounded, spacing, components{backgroundColor,textColor,typography,rounded,padding,size,height,width}`, `{group.token}` references, the eight `##` sections in order, unknown sections preserved; linter `@google/design.md` (`lint()` from `@google/design.md/linter`) 0.4.0 (2026-11)
- https://github.com/VoltAgent/awesome-design-md — the extended section set (Responsive Behavior, Agent Prompt Guide) coding agents read (2026-11)
- https://github.com/dembrandt/dembrandt — design extraction by rendering and sampling computed styles weighted by visibility; the approach the renderer path follows (2026-11)
- https://github.com/kepano/defuddle — `defuddle/node` on any DOM Document (linkedom), Markdown output, `useAsync` third-party fallbacks (0.19.6, 2026-11)
