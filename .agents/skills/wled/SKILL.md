---
name: wled
description: How to use @owlmeans/wled — the shared white-label contract — company info, custom styles, brand media and DNS shapes, their AJV schemas, the wl type constants and the single WL_PROVIDE entrypoint both sides elevate. Auto-invoked when importing white-label types or schemas, or when adding a white-label provider.
user-invocable: false
---

# @owlmeans/wled

**Layer:** Core
**Install:** `"@owlmeans/wled": "^0.1.18-rc.10"` in `dependencies`

The contract only. It owns no service and reaches no store: it declares the white-label record
shapes, their schemas, and one entrypoint that the server side answers and the browser side calls.
Everything that produces a white-label record lives downstream.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The single `WL_PROVIDE` declaration — a backend `GET /wl/provide/:entity`, filtered by `params(ProvideParamsSchema)` and guarded by nothing. Elevate it, never redeclare it |
| `WL_PROVIDE` | That entrypoint's alias. Both `@owlmeans/server-wl` and `@owlmeans/web-wl` elevate this exact alias |
| `WL_PROVIDE_PATH` | `'/wl/provide/:entity'` |
| `WL_TYPE_COMPANY_INFO`, `WL_TYPE_STYLES`, `WL_TYPE_MEDIA`, `WL_TYPE_DNS` | The `type` a provider stamps on the record it returns — `'company-info'`, `'styles'`, `'media'`, `'dns'` |
| `ProvidedWL<T>` | What one provider answers: `T & { type: string; exists: boolean \| null }` |
| `CompanyInfo` | `{ resource?, entityId, fullName, shortName, slug, description }` |
| `CustomStyles` | `{ resource?, entityId, font, colors }` — a whole theme record, not just the palette |
| `CustomFont`, `CustomColors` | `{ fontFamily, basicSize? }` (`basicSize` minimum 8), and a required `primaryColor` plus optional secondary/alert/success colours and their backgrounds |
| `CustomMedia`, `CustomBrand` | `{ brand: { squareLogo?, wideLogo? } }` — both are URLs |
| `CustomUrls` | `{ adminUrl, userUrl }` |
| `ProvideParams` | `{ entity: string }` — the one path param |
| `CompanyInfoSchema`, `CustomStylesSchema`, `CustomFontSchema`, `CustomColorsSchema`, `ColorSchema`, `ProvideParamsSchema` | The AJV schemas for the shapes above. `ajv` is a peer dependency |

## The provide contract

`WL_PROVIDE` answers one object per organization entity, keyed by **provider service alias** — not by
white-label type:

```typescript
import { WL_TYPE_MEDIA } from '@owlmeans/wled'
import type { CustomMedia, ProvidedWL } from '@owlmeans/wled'

// what a provider registered under the alias 'wl-logo' contributes
const media: ProvidedWL<CustomMedia> = {
  type: WL_TYPE_MEDIA,
  exists: true,
  brand: { wideLogo: 'https://…/wide.png' }
}
// → the response carries it as { 'wl-logo': media, 'wl-info': …, 'wl-styles': … }
```

So a reader picks a section by the alias it registered the provider under, and `type` tells it which
shape it is holding. `exists` is a tri-state: `true` a stored record, `false` a deliberate empty
default, `null` unknown.

## Rules

- **The declaration carries no guard.** Whatever elevates `WL_PROVIDE` serves it anonymously unless
  it adds one, so every section a deployment registers is readable by anyone who can name an
  organization. Put nothing in a white-label record that is not meant to be public, or add a guard
  where the entrypoint is elevated.
- `entityId`, `slug` and the `entity` param are declared with `EntityValueSchema` from
  `@owlmeans/auth`, a plain `{ type: 'string', minLength: 3, maxLength: 256 }` — it bounds length and
  nothing else, so a record id and a slug both pass (`CompanyInfo.slug` relaxes `minLength` to 0 on
  top of it). `EntityValueSchema` is `@deprecated` in favour of `EntitySlugValueSchema`, the identical
  schema it aliases; write new fields against the slug schema. What the `entity` param is expected to
  hold is the serving side's rule, not this package's — see the `server-wl` skill.
- `ColorSchema` accepts `#` followed by 3–8 hex digits (length 4–9), so a named CSS colour or an
  `rgb()` string fails it. That check runs only where `CustomColorsSchema` or `CustomStylesSchema` is
  actually applied — this package's own entrypoint filter validates the path params alone, so a
  package that stores styles must put the schema in its own filter or run it itself.
- `CustomStylesSchema` requires only `font` and `colors`, while the `CustomStyles` type also requires
  `entityId`. Construct the record from the type — an object that satisfies the schema can still be
  missing the id every provider keys on.
- Colours and fonts are all optional except `primaryColor` and `fontFamily` — a consumer must render
  with whatever subset it gets rather than assuming a full palette.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`
- `ajv` (peer)

Server side elevates the declaration through `@owlmeans/server-wl`; browser side through
`@owlmeans/web-wl`.
