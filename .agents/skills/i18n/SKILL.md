---
name: i18n
description: How to use @owlmeans/i18n — the core localization registry (no runtime deps). Auto-invoked when adding translatable strings to a library package, importing from this package, working with the tier/priority system, or deferring a language pack with addI18nLoader/loadI18nLanguage.
user-invocable: false
---

# @owlmeans/i18n

**Layer:** Core (no runtime deps)
**Install:** `"@owlmeans/i18n": "^0.1.18-rc.37"` in `dependencies`

## Purpose

Global registration store that packages write into at import time — or, for an application's deferred language packs, from an async loader. React clients drain it lazily via `@owlmeans/client-i18n`. The store is addressed by **(ns, resource, language)**.

## Key Exports

| Export | Description |
|--------|-------------|
| `addI18nLib(lng, resource, data, opts?)` | Register library-owned strings (ns defaults to `'lib'`) |
| `addI18nApp(lng, resource, data, opts?)` | Register app-owned strings (ns defaults to resource name) |
| `initI18nResource(lng, resource, ns?)` | Drain a registered bundle for a language (called by client-i18n) |
| `resolveI18nResource(lng, resource, ns = DEFAULT_NAMESPACE)` | The merged bundle of ANY language, read WITHOUT draining it — `null` when nothing is registered (see § Reading without draining) |
| `addI18nLoader(lng, loader)` | Register an async `I18nLoader` (`() => Promise<unknown>`, typically a dynamic `import()` of a module that calls `addI18nLib` / `addI18nApp`) for a language — see Deferred language packs |
| `loadI18nLanguage(lng)` | Await every loader registered for `lng`; idempotent, retries a failed loader |
| `isI18nLanguageLoaded(lng)` | Whether every loader of `lng` has completed; `true` for a language with none |
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
  `I18nTier` → number map the sort is written against; plus the separate loader store
  `_OwlMeansI18nLoaders` (`{ data }`, keyed by language) and `ensureLoaders(lng)`.

Reach for `./utils` only to work around the drain-once rule below: assigning
`_OwlMeansI18nStorage.data = {}` empties every slot including its `lngInitialized` marks, so a
suite can register and drain the same resource repeatedly; `_OwlMeansI18nLoaders.data = {}`
forgets every loader and request mark. This package's own tests reset both between cases.
Application and library code registers through `addI18nLib` / `addI18nApp`.

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

**A bundle only reaches i18next if it was REGISTERED before its slot is first drained.**
`initI18nResource` reads a (ns, resource, language) slot exactly once — it marks the slot drained
and answers `null` for every later call — so a bundle registered through `addI18nLib` /
`addI18nApp` after a screen has drawn that language adds nothing a component can read. Registering
synchronously at import time is the simplest way to guarantee it — a side-effect import at the top
of the entry file, which is what re-exporting `./i18n.js` from `src/index.ts` achieves. The loader
API (`addI18nLoader` / `loadI18nLanguage`) lets an application defer registration to an async load
instead, AS LONG AS it awaits `loadI18nLanguage` — or `@owlmeans/client-i18n`'s `prepareI18n` —
before the first render that would drain that language.

## Reading without draining

`resolveI18nResource(lng, resource, ns)` deep-merges every bundle registered for the slot in the
exact order `initI18nResource` hands them out — library tier, then app tier, `priority` ascending,
an unset priority last — so an app override wins as it does in i18next. Plain objects merge key by
key; any other value replaces (arrays are copied). It never marks the slot drained and never
creates an empty slot, so a later `initI18nResource` still returns the same bundles, and a drained
slot still resolves. The result never aliases a registered bundle.

Use it where there is no i18next instance or the language is not the active one: a server
rendering an e-mail or a paygate text, a legal text shown in the billing country's language while
the interface speaks another (`@owlmeans/payment`'s `consumerRightsCopy` is built on it). Pass the
namespace the bundle lives in — `LIB_NAMESPACE` for an `addI18nLib` bundle; the default is
i18next's own `'translation'`.

It reads only what is REGISTERED: a language an application defers to a loader (Deferred language
packs) resolves `null` — or without its app-tier overrides — until `await loadI18nLanguage(lng)`
has run for it.

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
import fr from './i18n/fr.json' with { type: 'json' }

addI18nLib('en', 'my-package', en)
addI18nLib('pl', 'my-package', pl)
addI18nLib('ru', 'my-package', ru)
addI18nLib('be', 'my-package', be)
addI18nLib('uk', 'my-package', uk)
addI18nLib('es', 'my-package', es)
addI18nLib('de', 'my-package', de)
addI18nLib('fr', 'my-package', fr)
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

All packages **must** ship the 7 languages from `SUPPORTED_LNGS`. Adding a new key → add it to all
7 files in the same commit. An application may opt into an additional language without changing the
global constant; a reusable package used by that application then ships and synchronously registers
the same extra bundle, while other applications retain their existing selectable languages.

### Deferred language packs (applications only)

An application may keep a language's bundles out of its initial chunk and register them from a
loader. The loader store is separate from the resource store: a loader only REGISTERS (it calls
`addI18nLib` / `addI18nApp` once its module evaluates); draining stays `initI18nResource`'s, once
per slot, unchanged.

```typescript
// app entry, module scope — each module calls addI18nApp('<lng>', …) when it evaluates
addI18nLoader('de', () => import('./i18n/de.js'))
addI18nLoader('pl', () => import('./i18n/pl.js'))
```

- A loader does not run until its language is requested by `loadI18nLanguage(lng)`; one registered
  AFTER the language was requested starts at once, so a module evaluated late is never skipped.
- `loadI18nLanguage(lng)` resolves once every loader of `lng` has completed — including loaders
  added while the call is in flight; one added after a call resolved is awaited by the next call.
  Concurrent and repeated calls share in-flight runs and never re-run a completed loader.
- A failure rejects the call once the pass has settled; the failed loader alone is retried by the
  next call, never cached as failed.
- The app awaits the fallback and the initial language before its first render —
  `@owlmeans/client-i18n`'s `prepareI18n` does both — and its `setLanguage` / `useLanguage` load a
  language before switching to it. `@owlmeans/web-panel` re-exports neither the loader API nor
  `prepareI18n` — import them from `@owlmeans/i18n` / `@owlmeans/client-i18n`.

A library package never defers: it registers every language synchronously at import (Per-package
pattern), because it cannot know the application it lands in awaits a boot step.

## Depends On

Nothing at runtime — pure types and helpers.
