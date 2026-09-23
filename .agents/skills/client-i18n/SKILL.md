---
name: client-i18n
description: How to use @owlmeans/client-i18n — React i18n context built on i18next. Auto-invoked when setting up translation in a React app, using translation hooks, working with language switching, or awaiting deferred language packs with prepareI18n.
user-invocable: false
---

# @owlmeans/client-i18n

**Layer:** Client (React)
**Install:** `"@owlmeans/client-i18n": "^0.1.18-rc.39"` in `dependencies`

## Purpose

Wraps i18next + react-i18next, lazily loads registered bundles from `@owlmeans/i18n` storage into the i18next instance, awaits deferred language packs (`prepareI18n`, `setLanguage`), and provides hooks for translating strings.

## Key Exports

| Export | Description |
|--------|-------------|
| `I18nContext` | Provider component — wraps the React tree with an i18next instance |
| `useI18nLib(resource, prefix?)` | Hook for library strings (ns=`'lib'`) |
| `useI18nApp(resource?, prefix?)` | Hook for app strings (ns=resource name; defaults to `context.cfg.service`) |
| `useI18n(resource, ns?, prefix?)` | Low-level hook with explicit ns — use when ns ≠ resource |
| `useLanguage()` | `[currentLng, setLng]` — the i18next instance's language, and an async switch — see Language persistence |
| `prepareI18n`, `resolveInitialLanguage`, `setLanguage` | Re-exported from `./utils` — see below |
| `composePrefix(parent?, child?)` | Canonical dot-join for prefix chaining; never call manually in panel code — used internally |
| `I18nBaseProps` | `{ resource?, ns?, prefix?, suppress? }` |
| `I18nProps` | `{ i18n?: I18nBaseProps }` |
| `I18nContextProps` | `{ config: ClientConfig }` — what the provider takes |

## Subpath: `./utils`

The instance itself, for a host that has to configure i18next before the tree renders.

| Export | Description |
|---|---|
| `useI18nInstance(config)` | The i18next instance for this application, memoised for the mount |
| `getI18nInstance(config)` | The same instance outside React |
| `setLanguage(lng)` | Async: load `lng`'s pack (`loadI18nLanguage`), then persist and switch — what `useLanguage`'s setter calls |
| `prepareI18n(config)` | Await the fallback language's loaders, then the initial language's; resolves to the language the instance will start in. Call once, before the first render |
| `resolveInitialLanguage(config)` | The persisted `owlmeans-lng` when it is in `supportedLngs`, else the browser's language (`preferredLanguageOf`), else `fallbackLng ?? defaultLng ?? DEFAULT_LNG` |
| `preferredLanguageOf(supportedLngs, preferred)` | Pure: the first preferred tag the config supports, exact or by base (`de-DE` → `de`), else `null` |

All six live in `src/utils/instance.ts`; the package root re-exports `prepareI18n`,
`resolveInitialLanguage` and `setLanguage`.

**There is exactly one instance per document**, created on first request and reused by every later
call whatever config is passed. So configuration is read once, at the first creation, and a plugin
is installed on the instance rather than passed to a second factory.

**The instance is initialized at creation with an explicit `lng`**, which is why the language is
resolved there and not by a plugin — by `resolveInitialLanguage` (or `prepareI18n`, which runs it):
the persisted choice (`owlmeans-lng`, when supported), else the browser's own language
(`navigator.languages` through `preferredLanguageOf` — a first visit from a German browser opens in
German), else `fallbackLng`. A language detector installed afterwards (`instance.use(detector)`,
which `@owlmeans/web-panel`'s `render` still does) is never consulted — harmless, but not what
detects. A detected language is not persisted, not even by the start-up switch that follows a
deferred pack's load; only an explicit choice (`setLanguage`) is.

## Setup (app root)

```tsx
import { I18nContext } from '@owlmeans/client-i18n'

function App() {
  return (
    <I18nContext config={clientConfig}>
      <Routes />
    </I18nContext>
  )
}
```

`clientConfig.i18n` is optional; it defaults to `SUPPORTED_LNGS` and `'en'` fallback.

**An app that defers language packs** (`addI18nLoader`, the `i18n` skill) calls
`await prepareI18n(config)` BEFORE its first render — never after:

```ts
import { prepareI18n } from '@owlmeans/client-i18n'

await prepareI18n(context.cfg)   // fallback pack first, then the persisted / browser / fallback one
render(context)
```

This composes with an async boot because `@owlmeans/web-client`'s `render` (and so `renderApp` and
`@owlmeans/web-panel`'s `render`) checks `document.readyState` instead of waiting for a
`DOMContentLoaded` that already fired. `prepareI18n` rejects only when the FALLBACK pack fails; when
the initial language's pack fails it logs, resolves to the fallback and leaves the persisted choice
alone, so the next visit retries it rather than stranding the user. Without `prepareI18n`, the
instance starts in the fallback whenever the wanted language is not loaded yet and switches once its
loaders finish (a brief fallback flash) — but nothing awaits a deferred FALLBACK pack, whose slots
are then drained empty for the session.

## Language persistence

The active language is persisted in `localStorage` under `owlmeans-lng` and restored on init — but
only when it is in `supportedLngs`, so a stored value that a later release dropped falls back to
the browser's language, then `fallbackLng`, instead of resolving nothing. Every storage and
`navigator` access is guarded, so a browser that refuses site data (or no browser) still renders.

`tests/instance.spec.ts` pins `preferredLanguageOf` (base matching, browser order, exact tag first,
`null` when nothing matches).

`setLanguage(lng)` is async: it awaits `loadI18nLanguage(lng)`, then persists and calls i18next's
`changeLanguage` — before the instance exists it records the language the instance will start in
instead. The LAST call wins: an earlier call whose load finishes later does nothing. A failed load
rejects, and nothing is persisted or switched.

`useLanguage()` returns `i18n.language` from `useTranslation()`, not local state, so every caller
re-renders on i18next's `languageChanged` and shows the same language whoever switched it. Its
setter returns a promise that never rejects (a failure is logged): the value changes only once the
pack has loaded and i18next switched, so a controlled `<select value={lng}>` stays on the current
language meanwhile, and stays there when the load fails.

```tsx
function LangSwitch() {
  const [lng, setLng] = useLanguage()
  return (
    <select value={lng} onChange={e => setLng(e.target.value)}>
      {['en','pl','ru','be','uk','es','de'].map(l => (
        <option key={l} value={l}>{l}</option>
      ))}
    </select>
  )
}
```

## Hooks

### useI18nLib — library packages

```typescript
// In a React component inside a library package
const t = useI18nLib('errors')          // loads lib:errors
const t = useI18nLib('errors', 'form')  // keyPrefix = errors.form
t('minLength')  // → lib:errors.form.minLength
```

### useI18nApp — app-level / project packages

```typescript
const t = useI18nApp()                       // uses context.cfg.service as resource+ns
const t = useI18nApp('my-app', 'home-screen') // explicit resource + prefix
t('title')  // → my-app:my-app.home-screen.title
```

### useI18n — explicit resource + ns

```typescript
// When ns and resource differ (e.g. DID namespace)
const t = useI18n('wallet', 'did', 'createKey')
t('title')  // → did:wallet.createKey.title
```

## Key resolution path

`useI18nLib('res', 'prefix')` → `t('key')`
→ i18next lookup: namespace=`lib`, keyPath=`res.prefix.key`
→ bundle was loaded as `{ res: jsonData }` into namespace `lib`
→ resolved value is `jsonData.prefix.key`

## App-level override of library strings

Import the library's i18n registration **and** register your own version at App tier **in the
library's namespace**:
```typescript
import '@owlmeans/error'               // the library bundle, registered by side effect
import { addI18nApp, LIB_NAMESPACE } from '@owlmeans/i18n'
import myErrors from './i18n/en.json' with { type: 'json' }

// App tier merges last within (ns, resource, lng) — these override the library's 'errors' strings
addI18nApp('en', 'errors', myErrors, { ns: LIB_NAMESPACE })
```

`{ ns: LIB_NAMESPACE }` is what makes it an override. `addI18nApp` defaults the namespace to the
**resource** name, so without it the bundle lands in namespace `errors` while `useI18nLib('errors')`
reads namespace `lib` — nothing errors, nothing merges, and the library strings keep rendering.

A package registers its strings from its own root: `src/i18n.ts` is re-exported by `src/index.ts`,
so importing the package is what loads them. No package publishes an `./i18n` subpath.

## Resource JSON format

The shared instance runs i18next's **v4** JSON format — `compatibilityJSON` is not set and must
not be, because i18next >= 26 accepts only `'v4'` and rejects `'v3'` at compile time. Plurals
therefore use Intl.PluralRules suffixes (`key_one` / `key_other`), never the v3 `key_plural` /
`key_0` / `key_1` forms. No resource in the ecosystem carries a plural-suffixed key today;
`{{count}}` in a message is plain interpolation and is unaffected.

Keep `i18next` and `react-i18next` in step — `react-i18next@17` requires `i18next >= 26.2.0`, and
a dependabot bump of one without the other leaves an unmet peer that installs fine and only
misbehaves at runtime.

## Depends On

`@owlmeans/i18n`, `@owlmeans/client`, `@owlmeans/client-context`, `i18next` (>= 26.2),
`react-i18next` (>= 17), `react` (the one peer). `@owlmeans/client` is what `useI18nApp` reads the
current context from, to default the resource to `context.cfg.service`.
