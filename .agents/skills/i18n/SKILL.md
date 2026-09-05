---
name: i18n
description: How to use @owlmeans/i18n — the core localization registry (no runtime deps). Auto-invoked when adding translatable strings to a library package, importing from this package, or working with the tier/priority system.
user-invocable: false
---

# @owlmeans/i18n

**Layer:** Core (no runtime deps)
**Install:** `"@owlmeans/i18n": "^0.1.18-rc.7"` in `dependencies`

## Purpose

Global registration store that packages write into at import time. React clients drain it lazily via `@owlmeans/client-i18n`. The store is addressed by **(ns, resource, language)**.

## Key Exports

| Export | Description |
|--------|-------------|
| `addI18nLib(lng, resource, data, opts?)` | Register library-owned strings (ns defaults to `'lib'`) |
| `addI18nApp(lng, resource, data, opts?)` | Register app-owned strings (ns defaults to resource name) |
| `initI18nResource(lng, resource, ns?)` | Drain a registered bundle for a language (called by client-i18n) |
| `SUPPORTED_LNGS` / `SupportedLng` | `['en','pl','ru','be','uk','es','de']` — the canonical language set, and its union type |
| `DEFAULT_LNG` | `'en'` |
| `LIB_NAMESPACE` | `'lib'` |
| `DEFAULT_NAMESPACE` | `'translation'` — i18next's own default namespace, used whenever a lookup names none and `I18nConfig.defaultNs` is unset |
| `I18nTier` | `Library \| App` — enum used internally |
| `I18nConfig` | `{ defaultLng?, defaultNs?, fallbackLng?, supportedLngs? }` |
| `I18nResourceOptions` | `{ ns?, priority? }` — the `opts` every `add*` takes |
| `MAX_PRIORITY` | `Number.MAX_SAFE_INTEGER` — the value substituted for an unset `priority`, which is what makes an unset one sort last |

`opts` also accepts a bare string, which is read as `ns`: `addI18nLib('en', 'wallet', walletEn, 'did')`.

## Subpath Exports

- `./utils` — the store itself: `_OwlMeansI18nStorage` (`{ data }`, keyed ns → resource → language),
  `ensureStructure(lng, resource, ns?)` which creates and returns one slot, and `tierCost`, the
  `I18nTier` → number map the sort is written against.

Reach for `./utils` only to work around the drain-once rule below: assigning
`_OwlMeansI18nStorage.data = {}` empties every slot including its `lngInitialized` marks, so a
suite can register and drain the same resource repeatedly. This package's own tests do exactly
that between cases. Application and library code registers through `addI18nLib` / `addI18nApp`.

## Tiers

| Tier | Helper | Default ns | When to use |
|------|--------|-----------|-------------|
| Library | `addI18nLib` | `'lib'` | Any `@owlmeans/*` package |
| App | `addI18nApp` | resource name | Project-specific app / shared project package |

App-tier strings deep-merge **over** Library-tier strings at resolution time — but only for the
same **(ns, resource, language)** slot, because that triple is the address the store is keyed on
and the only thing `initI18nResource` drains. The default namespaces differ (`'lib'` for
`addI18nLib`, the resource name for `addI18nApp`), so overriding a library bundle means saying so:

```typescript
import { addI18nApp, LIB_NAMESPACE } from '@owlmeans/i18n'

addI18nApp('en', 'errors', myErrors, { ns: LIB_NAMESPACE })
```

Without `{ ns: LIB_NAMESPACE }` the app bundle lands in namespace `errors` while the library's sits
in `lib`. Nothing errors, nothing merges, and the library strings keep rendering.

Within one tier the order is `priority`, ascending, and every bundle is merged over the one before
it — so the **last** applied wins. A registration that states no `priority` sorts last and
therefore beats every one that states a number: `priority` lowers a bundle in the stack rather than
raising it. Leave it unset unless one library must lose to another.

**A bundle only reaches i18next if it was registered before the first draw for its language.**
`initI18nResource` marks the (ns, resource, language) slot drained and answers `null` for every
later call, so an `import '@owlmeans/<pkg>'` evaluated after a screen has rendered adds nothing a
component can read. Register at module load — a side-effect import at the top of the entry file,
which is what re-exporting `./i18n.js` from `src/index.ts` achieves.

## Per-package pattern

Every package that ships translatable strings exports a side-effect `i18n.ts`:

```typescript
// src/i18n.ts
import { addI18nLib } from '@owlmeans/i18n'
import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }

addI18nLib('en', 'my-package', en)
addI18nLib('pl', 'my-package', pl)
addI18nLib('ru', 'my-package', ru)
addI18nLib('be', 'my-package', be)
addI18nLib('uk', 'my-package', uk)
addI18nLib('es', 'my-package', es)
addI18nLib('de', 'my-package', de)
```

Then re-export from `src/index.ts`:
```typescript
export * from './i18n.js'
```

## Key structure

Keys are plain dot-paths inside a JSON file:
```json
{
  "mySection": {
    "title": "Title",
    "description": "Description"
  },
  "form-field": "Invalid field"
}
```

Consumers use `useI18nLib('my-package', 'mySection')` → `t('title')` → resolves `lib:my-package.mySection.title`.

## Custom namespace (rare)

Use the optional `opts.ns` when keys must live in a namespace other than `'lib'`:
```typescript
addI18nLib('en', 'wallet', walletEn, { ns: 'did' })
```

## Languages

All packages **must** ship all 7 languages from `SUPPORTED_LNGS`. Adding a new key → add it to all 7 files in the same commit.

## Depends On

Nothing at runtime — pure types and helpers.
