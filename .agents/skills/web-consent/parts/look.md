---
name: look
description: The flat look from the host's tokens — the class table, focus outlines, switches named by reference, and the axe and harness checks that pin them.
metadata:
  purposes: consent, theme
  mentions: barClassName, ConsentToggle, data-consent-overlay, a11y.spec, outline-ring
---

# @owlmeans/web-consent — The look

## The look — flat, from the host's tokens

The bar and the window are the first thing every new visitor of a generated app sees, so they
follow the flat rule those apps are held to: **no gradient, shadow, glow, glass or
`backdrop-filter`** anywhere. Everything is a theme token, so light and dark follow the host:

| Part | Classes |
|---|---|
| Bar overlay | `bg-black/70`, matching the preferences window — the page is dimmed beneath the opaque bar |
| Locating overlay | `bg-transparent` — a quick region lookup flashes no backdrop |
| Bar | `border-t border-border bg-background text-foreground`, no shadow |
| Bar answers | "Accept only mandatory" and "Accept All" both the accent pill; "Cookie preferences" outlined |
| Spinner | `text-muted-foreground motion-safe:animate-spin` |
| Window overlay | `bg-black/70`, flat — no blur |
| Card | `rounded-3xl border border-border bg-background text-foreground`, no shadow or ring |
| Icon | `rounded-full bg-muted text-primary` |
| Category row | `rounded-2xl border border-border`; *Required* is plain uppercase muted text, never a badge |
| Switch | `bg-primary` on / `bg-muted-foreground/40` off, white knob; 44px hit area around the 24×44 track |
| Accept | the one accent pill — `rounded-full bg-primary text-primary-foreground min-h-11` |
| Save, policy *Manage preferences* | outlined pill — `rounded-full border-[1.5px] border-foreground bg-transparent`, `hover:bg-muted` |
| Links | muted, underlined at rest, `min-h-11` |

Every control shows a 3px `outline-ring` focus outline 3px off the element (`outline-3
outline-offset-3`; the switch draws it on its track through `peer-focus-visible`). An outline, not
a ring, so a host that zeroes shadows keeps it. Never reintroduce a decorative class here — the
package tests fail on `bg-gradient`, `backdrop-`, `blur`, `shadow` or `ring-primary` in the dialog.

**Each switch is named by reference.** The `<label>` around a switch's checkbox holds only the
drawn track, and the category's words sit in a sibling column it cannot reach, so the checkbox
carries `aria-labelledby="<id>-label"` (the category label) and `aria-describedby` pointing at
`<id>-required` and `<id>-desc`. Drop those and axe reports three unnamed checkboxes (`label`,
critical). A required category stays `disabled` and keeps its name.

`tests/a11y.spec.ts` runs axe-core (a dev dependency) against the open bar and the open window in
both schemes, the locating overlay, the re-open button, and the policy page with services and the
regional rule, and fails on any serious or critical violation. It loads the harness with `?styled=1` (plus `&theme=dark`), which compiles the package
sources with a generated app's neutral tokens — contrast cannot be judged on the unstyled harness
the other specs need. The harness also takes `?mode=bar|window`, `?categories=essential`,
`?geo=<CC>|fail|html|hang` (its server answers `/cdn-cgi/trace` from the page's own query, so every
case is still chosen by URL; `&geoDelay=<ms>`, `&geoTimeout=<ms>`), `?geoPlugin=<CC>|fail` and
`?gpc=1` — `tests/bar.spec.ts` and `tests/geo.spec.ts` drive them.
