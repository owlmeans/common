---
name: i18n
description: How to use @owlmeans/i18n — the core localization registry (no runtime deps). Auto-invoked when adding translatable strings to a library package, importing from this package, or working with the tier/priority system.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/i18n

**Layer:** Core (no runtime deps)
**Install:** `"@owlmeans/i18n": "^0.1.16"` in `dependencies`

## Purpose

Global registration store that packages write into at import time. React clients drain it lazily via `@owlmeans/client-i18n`. The store is addressed by **(ns, resource, language)**.

## Key Exports

| Export | Description |
|--------|-------------|
| `addI18nLib(lng, resource, data, opts?)` | Register library-owned strings (ns defaults to `'lib'`) |
| `addI18nApp(lng, resource, data, opts?)` | Register app-owned strings (ns defaults to resource name) |
| `initI18nResource(lng, resource, ns?)` | Drain a registered bundle for a language (called by client-i18n) |
| `SUPPORTED_LNGS` | `['en','pl','ru','be','uk','es','de']` — the canonical language set |
| `DEFAULT_LNG` | `'en'` |
| `LIB_NAMESPACE` | `'lib'` |
| `I18nTier` | `Library \| App` — enum used internally |
| `I18nConfig` | `{ defaultLng?, defaultNs?, fallbackLng?, supportedLngs? }` |

## Tiers

| Tier | Helper | Default ns | When to use |
|------|--------|-----------|-------------|
| Library | `addI18nLib` | `'lib'` | Any `@owlmeans/*` package |
| App | `addI18nApp` | resource name | Project-specific app / shared project package |

App-tier strings deep-merge **over** Library-tier strings for the same keys at resolution time — this is the override mechanism.

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
