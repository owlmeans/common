---
name: i18n
description: How to use @owlmeans/i18n — internationalization core types and helpers used by error messages and UI labels. Auto-invoked when importing from this package or adding translatable strings to a package.
user-invocable: false
---

# @owlmeans/i18n

**Layer:** Core
**Install:** `"@owlmeans/i18n": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `I18nResource` types | Resource bundle shape (namespaces, keys, translations) |
| Helpers | Register and resolve translation keys |
| Constants | Default language codes, namespace separators |

## Subpath Exports

- `./utils` — utility functions for working with translation bundles

## Usage

Each package that ships translatable strings exports an `i18n.ts` (e.g. `./i18n.js`) that registers its bundle. Consumer apps re-export them through `@owlmeans/client-i18n` (web) which wraps i18next.

```typescript
import type { I18nResource } from '@owlmeans/i18n'

const resource: I18nResource = {
  ns: 'my-package',
  resources: {
    en: { 'error.unknown': 'Unknown error' },
    es: { 'error.unknown': 'Error desconocido' }
  }
}
```

## Depends On

- None at runtime — pure types and helpers
