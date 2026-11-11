---
name: consent
description: How to use @owlmeans/consent and @owlmeans/web-consent — the provider-agnostic cookie-consent model, its categories (the tracking flag, the global-variable seam), the storage contract and its migration, the signal-provider host a tag vendor's package registers into, the geo gate that asks only in consent-requiring countries (locator plugins, Cloudflare mode, automatic decisions), the inline head scripts and loader gate, and the ordering rule that makes a tag honour any of it. Auto-invoked when touching consent categories, the bar or dialog, a signal provider, the geo gate, the cookie policy page, or a tag snippet.
user-invocable: false
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Cookie consent

The packages are split so the one an island loads stays small and names no tag vendor; a vendor's
signals live in the vendor's own package:

| Package | Layer | Holds |
|---|---|---|
| `@owlmeans/consent` | Core, **zero runtime dependencies**, provider-agnostic | categories, storage, the observable store, the signal-provider host (`consentSignalHelper`), the tracking gate and inline head scripts (`consentTrackingHelper`), the geo gate (`consentGeoHelper`, the country lists), the built-in copy |
| `@owlmeans/web-consent` | Web (React) | the bar, the preferences window, the locating spinner, the re-open button, `CookiePolicy`, `useConsent` |
| `@owlmeans/web-gtm` (OwlMeans connect) | Web | Google Consent Mode as a signal provider (`appendGoogleConsentMode`), the Google tag head snippet (container or gtag.js) with its Consent Mode bootstrap, the head tag an Astro layout stamps, the tag-manager analytics sink, its CSP hosts and its cookie-policy disclosure — provider-specific, so it lives in connect and common never depends on it (`/web-gtm`) |
| `@owlmeans/web-panel/consent` | subpath | the same components, bound to OwlMeans i18n and language, plus a menu-row widget and a ref-counted presence service so a host's own collapsed menu can take over the floating button's job |

`CONSENT_LOCALES` may include an application-specific locale beyond `SUPPORTED_LNGS` when the core
package ships its complete built-in copy. The manager’s French locale follows this rule; do not
expand the reusable i18n package’s global language list for one application.

## Why it is not in `web-panel`

One of the three surfaces this serves is an Astro site that vendors its own component library.
Putting the dialog behind `web-panel` would drag ~30 packages and the `@/components/ui` alias
contract onto it, so a consent notice would be out of reach of the site that needs it most.

For the same reason **`@owlmeans/web-consent` uses no shadcn primitive and no `@` alias** — it owns
a four-line `cn` of its own. The `@` contract exists so a consumer's THEME and primitives win;
`cn` has neither in it.

It still emits Tailwind classes, so **every consumer adds one `@source` line** pointing at the
installed package's **`src`**:

```css
@source "<relative path to node_modules>/@owlmeans/web-consent/src";
```

Point it at `src`, never at `build`. Tailwind's scanner applies the `.gitignore` of whatever
repository a path resolves into, and under the linked-workspace layout the `node_modules` entry is
a symlink into this monorepo — where every package `build` directory is ignored. A `build` source
there scans **zero files and reports nothing**: the build succeeds, the CSS is emitted, and the
dialog renders *half*-styled, because the utilities the consumer happens to use elsewhere (`flex`,
`border`, `bg-primary`) still exist while the ones only this package asks for (`max-w-lg`,
`bg-black/70`, `z-[999998]`) do not. What reaches the screen is a full-width, backdrop-less dialog
with the page bleeding through — and nothing in the consumer's sources looks wrong. `src` is
tracked here and ships in the published tarball, so the one path serves a linked checkout and an
npm install alike.

Verify rather than assume, because the failure is silent — grep the emitted stylesheet for a class
only this package uses:

```sh
grep -c 'max-w-lg' <consumer>/dist/assets/*.css
```

A `*/` inside a CSS comment ends it early. A comment above an `@source` line that spells out a
workspace glob — any path with a star-slash-star in it, as an explanation of what is being scanned
would naturally contain — closes the comment at that star-slash and turns the next `@source` into
`Invalid declaration: build @source ...`. Describe the glob in words, or keep it out of the comment.

## Categories

```typescript
interface ConsentCategory {
  key: string
  required?: boolean       // always granted; rendered locked and labelled Required
  labelKey: string
  descriptionKey: string
  globalVar?: string       // window[globalVar] = granted, written BEFORE any signal provider runs
  tracking?: boolean       // granting it releases a consent-gated loader (true on analytics, marketing)
}
```

The default set is `essential` (required), `analytics`, `marketing` (both `tracking: true`) — what
owlmeans.com already asked, plus the essential row the original widget left implicit (what lets a
flow require an acknowledgement before it sets a session cookie, and tells a visitor what is stored
regardless: the consent record itself and the interface language the visitor picked).

A category carries no vendor data. How categories map onto a vendor's signals (Consent Mode's
`analytics_storage`, a pixel's switch) is the vendor provider's own map, with overrides in that
provider's options — keyed by category key, so a custom category is mapped there, not here.

**The interface language is strictly necessary storage, and no category governs it.** The visitor
asked for it by choosing it, and the site cannot speak to them without it, so it is written to
`owlmeans-lng` (`CONSENT_LANGUAGE_KEY`) whatever the cookie decision is — none yet, a refusal, an
old record. There is no `functional` category, no purge of a preference when consent is withdrawn, and
no "remembered only while granted" rule: a category that governed nothing would be a dialog row
offering a choice that changes nothing. Records saved while a `functional` key existed keep it as an
unread extra key. A preference the visitor did NOT set by an action of their own is a different
matter: it would need a category of its own and a consent, exactly as before.

`globalVar` is the seam for anything that cannot subscribe: a tag manager's custom-HTML tag reading
a flag, a hand-placed pixel, a script that runs once. Globals are written **before** any signal
provider applies a decision, so a tag firing on a provider's update reads them in the same turn.

`tracking` is what the loader gate reads (`consentTrackingHelper.trackingGranted`,
`consentGateScript`): an optional category marked `tracking: true` and granted releases a gated
loader. A required category never counts, whatever it says. A custom category that should release a
gated tag needs the flag.

> **A required category is disclosure, not a question.** Strictly-necessary storage does not need
> consent under ePrivacy, and a dialog that presents it as a choice is itself a dark pattern. Never
> word the login gate as "you must consent to essential cookies" — it records an acknowledgement
> before a flow that sets a session cookie.

## Storage

`site_cookie_consent`, JSON, written to **both** localStorage and a 365-day `path=/` cookie,
localStorage read first. `v` (the schema version, `2`) and `auto` (see "Where consent is asked")
are reserved keys; every other key is a category, so no category may be called `v` or `auto`. The key and the dual write are unchanged from the widget this
generalises, and must stay unchanged: owlmeans.com has visitors who already chose.

**Migration is the load-bearing part.** A record with no `v` predates the explicit essential
category, when it was implicitly on. It is upgraded IN PLACE (`essential: true`, `v: 2`) rather
than treated as unusable — the visitor did decide, and re-asking is a regression they experience as
the site forgetting. `cookieDomain` stays unset by default for the same reason: setting one orphans
the existing host-only cookie.

`SameSite=Lax` is stated explicitly; browsers differ on the default, and this cookie is never sent
cross-site. `clearConsent` names the same `cookieDomain` the write named — a cookie is only replaced
by one that names its domain.

## Where consent is asked — the geo gate

`ConsentOptions.geo` (`ConsentGeoOptions`) makes the store ask only where the law requires prior
consent. Its PRESENCE turns the gate on; without it every visitor is asked, as before.

```typescript
interface ConsentGeoOptions {
  cloudflare?: boolean | { path?: string }   // the built-in locator: same-origin /cdn-cgi/trace
  countries?: readonly string[]              // who is asked; default CONSENT_REQUIRED_COUNTRIES
  timeout?: number                           // ms; default CONSENT_GEO_TIMEOUT (2500)
}
interface ConsentGeoPlugin extends ConsentPlugin {
  locate: (opts: ConsentOptions) => Promise<{ country: string }>   // resolve, or throw
}
```

- **Locators are plugins.** `ConsentPlugin.locate` is the hook; a `ConsentGeoPlugin` is a plugin
  that implements it, registered with `consentPluginHelper.registerConsentPlugin` — in an OwlMeans
  application with `@owlmeans/web-panel/consent`'s `appendConsentGeoPlugin(context, plugin)` while
  the context is configured. `cloudflare` registers the built-in one (`consentGeoHelper.cloudflareLocator()`,
  alias `cloudflare`, priority −100 — below anything an application adds), exactly as `linker`
  registers the linker. `consentPluginHelper.locateConsent` asks them highest priority first; a throw,
  or a code that names no country (`CONSENT_GEO_UNKNOWN`: `XX`, `T1`, `A1`, `A2`, `O1`, `EU`, `AP`,
  `ZZ`, or anything not ISO alpha-2), hands over to the next one.
- **The Cloudflare locator** GETs `CONSENT_TRACE_PATH` (`/cdn-cgi/trace`) on the page's own origin,
  `credentials: 'omit'`, `cache: 'no-store'`, and reads `loc=` from the `key=value` lines. It counts
  only a body that names the edge (`colo` or `fl`): an SPA answers its `index.html` for every path
  with 200. It works only on a Cloudflare-proxied host — on `vite dev`, `astro dev` or a self-hosted
  export it fails, and the visitor is asked. Same origin, so a `connect-src 'self'` CSP admits it and
  it is no third-party request.
- **The decision** (`consentGeoHelper.decide`, bounded by `timeout`, never rejects): a located country
  inside `countries` → ask; outside → an automatic decision; nobody could tell → ask.
- **The automatic decision** (`consentGeoHelper.automaticRecord`) grants every category — or, when
  the browser sends Global Privacy Control (`navigator.globalPrivacyControl`), only the required
  ones: several US states make that signal a binding opt-out. It is stored like any record, plus
  `auto: <unix seconds>`, and applied, so `CONSENT_EVENT` fires and a gated tag loads.
- **An automatic decision lives one hour** (`CONSENT_AUTO_MAX_AGE`). Older, it counts as NO decision
  everywhere: the inline bootstrap skips it, `consentGateScript` treats it as `null`, and the store
  holds it back (`state.record` stays `null`) while it re-locates silently. Still outside → a fresh
  automatic record; inside, or unknown → the record is cleared and the visitor asked. That is what
  stops a grant derived in one country from reaching a page opened in another — the head scripts
  run before any bundle, so only a lifetime they also read can.
- **Explicit beats automatic, always.** `consentStore.save` drops `auto` (whatever the caller
  passed), a decision carried by the linker is adopted over an automatic one (TS path and inline
  fragment alike), and an automatic decision never travels on a link: `encodeConsentLink`, `decorate`
  and the click handler treat it as no decision, so the receiving domain locates the visitor itself.
- **The country lists** are `CONSENT_COUNTRIES_GDPR` (EU-27, the parts of member states with their
  own code — AX GF GP MQ RE YT MF — and IS LI NO), `CONSENT_COUNTRIES_ALIGNED` (the UK, Crown
  Dependencies, Gibraltar, Switzerland, the European microstates, Türkiye, Serbia and the other
  GDPR-modelled European laws, the Danish/French/Dutch territories) and `CONSENT_COUNTRIES_OPT_IN`
  (BR CA CN KR NG SA TH VN — Canada for Québec, since a CDN reports no province); their frozen union
  is `CONSENT_REQUIRED_COUNTRIES`. India joins when the DPDP consent rules apply (mid-2027); the
  notice-or-opt-out regimes (US, JP, AU, SG) stay out. Each tier's doc comment carries the legal
  basis — revise the lists there, with the date, never in an application.
- **The state says what is happening.** `ConsentState.locating` is `'first'` while a first-time
  visitor is located (the UI shows a transparent overlay and a spinner, never the bar) and
  `'recheck'` during a silent re-check; `consentStore.settled()` resolves once no lookup runs. Every
  publish mirrors the phase onto `<html data-consent="locating|open|decided|idle">`
  (`CONSENT_STATE_ATTRIBUTE`) — what a test waits on and a stylesheet may key on; it is absent until
  the store first runs.
- **Pass the same `geo` everywhere `init` runs.** Options accumulate, and a later `init` that brings
  `geo` takes the store from its own first ask back to locating — but a tag loader that starts the
  store given no `geo` before the dialog mounts is the case that needs it. A window open for a reason of its own (`login`) is
  never decided over; a `save` during a lookup wins over its result.

## Signal providers (`consentSignalHelper`)

This package names no tag vendor. What a vendor's tags read — Consent Mode commands on a queue, a
pixel's own switch — is a `ConsentSignalProvider`, shipped by the vendor's package and registered
explicitly (`login-methods`' rule: never a side effect of an import):

```typescript
interface ConsentSignalProvider {
  id: string                                         // register replaces by id
  defaults: (opts: ConsentOptions) => void           // the pre-decision state, before anything is read
  apply: (record: ConsentRecord, opts: ConsentOptions) => void   // every decision
  bootstrapScript?: (opts?: ConsentOptions) => string            // its inline <head> script
}
```

- **The host** — `consentSignalHelper`: `register`, `unregister`, `get`, `list` (registration order),
  `clear` (tests), and the two moments the store drives: `defaults(opts)` (every provider's, from
  `consentStore.init` before storage is read) and `apply(record, opts)`. Module-global, like the
  plugin registry: consent is one thing per document.
- **`apply` order is load-bearing**: the category globals first, then every provider's `apply`, then
  `CONSENT_EVENT`. A tag firing on a provider's update reads the globals in the same turn; a gate
  that hears the event loads its tag only after every provider has spoken.
- **No provider** — the store still stores, asks, decides, writes the globals and dispatches the
  event; it simply signals nothing. A provider that throws never stops the others or the event.
- **`silent: true`** — no globals, no provider, no event (tests, an app that runs no tags).
- **Idempotence is the provider's.** `init` calls `defaults` on every init; a provider that must
  declare once per document (Consent Mode: a second `default` after a tag loaded can WIDEN what was
  narrowed) keeps a window flag, shared with its own head bootstrap.
- **Register once, where the store runs** — a web app's context, a site's consent island, a
  generated target's `owlmeans.ts` — with the same options its head bootstrap was built with.
  Google Consent Mode is connect's `@owlmeans/web-gtm`: `appendGoogleConsentMode(opts?)`.

## The ordering rule

**A tag's defaults, and a stored decision, must come from an inline script ABOVE the tag's loader.**
A tag decides what it may do from the state present when it loads, and a React bundle cannot get
there first: by the time an island mounts, a container has been running for hundreds of
milliseconds and has already decided.

`consentTrackingHelper.consentBootstrapScript(opts)` is the provider-free head script: the linker's
adopt-and-strip fragment (with `opts.linker`), then the stored record — an automatic one past its age
skipped — written onto the category globals. It declares no vendor's signals. A page with a tag
stamps that tag package's head instead, which carries the vendor's defaults, the same linker
fragment, the globals and the stored decision's update ahead of the loader — connect's
`googleTagHelper.googleTagHeadScript()` / `headTag()` / `consentHeadTag()` (`/web-gtm`). A provider
package builds its head over the same storage contract with two inline building blocks:
`consentTrackingHelper.storageReadScript(opts)` (declares `raw`, localStorage then cookie, `w`/`d` in
scope) and `staleAutoScript(onStale)` (the automatic-decision age rule on a parsed `r`).

Every consumer stamps its head from HTML:

- `manager-web` — a Vite `transformIndexHtml` plugin (`tagManagerHelper` in viable's common), so the
  snippet cannot drift from the package; with no tag id it stamps the linker fragment alone.
- owlmeans.com — `astroHelper.owlHeadScripts({ consent, tag: googleTagHelper.headTag({ ...consent, id }) })`
  from `@owlmeans/astro` with `@owlmeans/web-gtm`'s head tag, `set:html` in `Base.astro`; a tag-less
  `owlHeadScripts` is the neutral bootstrap.
- a generated target — its `rollup.config.js` emits `googleTagHelper.googleTagHeadScript({ id })` when
  the project owner set a Google tag, and `googleTagHelper.consentHeadTag().head` otherwise, in
  preview and production alike.

## Gated loading (`consentTrackingHelper.trackingGranted`, `consentGateScript`, `CONSENT_EVENT`)

Signals tell a LOADED tag what it may do; they say nothing about whether the tag should be requested
at all. A loader withheld until consent (`@owlmeans/web-gtm`'s `'basic'` mode, its default) is built
from three provider-free primitives that live here, so any loader — including one in a target
project — reuses the same gate:

- **`consentTrackingHelper.trackingGranted(record, categories?)`** — whether a stored/applied record
  grants tracking at all: some category that is NOT `required` and is marked `tracking: true` is
  `true` in the record. A required category never counts — it is disclosure, not a question.
- **`CONSENT_EVENT`** (`'owlmeans:consent'`) — dispatched on `window` by `consentSignalHelper.apply`
  after the globals and every provider, `detail: { record }`. It is the only way a loader that
  already ran — and decided, on first paint, not to load yet — can hear a LATER grant. Guarded so it
  never throws where `CustomEvent`/`dispatchEvent` are not shimmed (tests, SSR).
- **`consentTrackingHelper.consentGateScript(loaderExpr, opts?)`** — the inline counterpart for
  withholding a loader: the SAME localStorage-then-cookie lookup the bootstrap uses, then either
  `loaderExpr` at once (a returning visitor already satisfies `trackingGranted` — an automatic
  decision past `CONSENT_AUTO_MAX_AGE` does not) or a one-shot `CONSENT_EVENT` listener that runs it
  on the first grant and removes itself. `loaderExpr` is a complete, already-self-invoking statement,
  embedded verbatim. Its per-category JSON keeps the field name `hasSignal` (true for a tracking or a
  required category — `!c.required` vetoes the latter first) so the emitted text is byte-identical to
  what pages served under a hash-based CSP already carry. It does not escape `</` or `<!--` for HTML
  — escaping the composed result is the caller's job (`googleTagHelper` does it over its whole
  output).

`consentModeHelper` survives as a deprecated object (`compat:consent-signals`) of provider-free
delegates — `trackingGranted`, `consentBootstrapScript`, `consentGateScript` to the tracking helper,
`pushConsentDefaults`, `applyConsent` to the signal host — because a generated target's 0.1
`rollup.config.js` imports it. Its `consentBootstrapScript` declares no Consent Mode now. New code
never uses it.

## The store

`consentStore` is a module singleton, and deliberately so: consent is a property of the DOCUMENT,
not of a component tree, and it has to be reachable from places that are not React — the sign-in
precondition runs inside a click handler.

`consentStore.init(opts)` is what starts it: every provider's defaults, read and migrate the stored
record, apply it, and — when there is none — ask, or with `geo` locate first (see "Where consent is
asked").
It stays synchronous; `consentStore.settled()` is what waits for a lookup. `useConsent()` calls it
on mount, and a tag package's script loader calls it before its tag — a host that mounts neither
calls it itself, once, with the same options everything else was given. The linker is registered
once per document, so a second `init` never installs a second click listener.

`useConsent()` subscribes through `useSyncExternalStore`; `consentStore.open(reason)` and
`consentStore.granted(key)` are the imperative readers.

`silent: true` in `ConsentOptions` suppresses the **runtime** effects — `consentSignalHelper.defaults`
and `apply` return before any provider, global or event — while leaving storage and the dialog
intact. It is for tests and for an application that runs no tags. It does **not** reach a stamped
snippet: a head bootstrap ignores the flag. A surface that must emit nothing at all stamps no
bootstrap.


## The plugin seam and cross-domain consent (`consentLinkHelper.consentLinker`)

`ConsentPlugin` (`types.ts`) is the extension seam the core package needed to share a decision
between DOMAINS without knowing anything about the mechanism: `{ alias, priority?, start?, adopt?,
adoptLanguage?, decorate?, domains?, locate? }` (`locate` is the geo gate's hook — see "Where consent
is asked"), registered module-globally through `consentPluginHelper.registerConsentPlugin` (replace by
alias, priority-sorted higher first — the same registry shape `client-auth/login`'s method/step
registries use). Nothing here is specific to the one built-in plugin; a host could register its own
for a different sharing mechanism entirely.

`consentLinkHelper.consentLinker()` (`linker.ts`) is that one built-in plugin: it shares a decision between the
domains named in `opts.linker.domains` through a decorated link, so a visitor who already decided
on one first-party domain is not asked again on another. The same link also carries the interface
LANGUAGE (see "Language rides the same link" below).

- **The wire format.** `owlcc` (configurable via `linker.param`) = base64url JSON `{ v: 2, c: {
  <optional category>: 0|1 }, t: <unix seconds>, l?: <language> }` — `consentLinkHelper.encodeConsentLink`/
  `.decodeConsentLink`. Only the OPTIONAL categories travel; a required one is always forced `true`
  on the receiving side regardless of what the payload says. `c` is `{}` while the sender has no
  decision yet, and `l` (a lower-cased BCP 47 tag) is present only when `linker.language` is set.
  Both are optional additions to `v: 2`, so an older receiver reads the same payload and ignores
  what it does not know.
- **Decorate** (`start`, installed once per `consentStore.init`): a capture-phase `click` /
  `auxclick` / `contextmenu` listener on `document`, so it decides before the click's own
  navigation — or a framework router intercepting it — reads `href`. It decorates an `<a href>`
  only while a LOCAL decision exists (or, with `linker.language` set, always — the receiver may hold
  a decision of its own, and it alone decides whether the language is stored), only when the target
  host is LISTED and is not the
  current host, and never when the anchor's `rel` carries `noreferrer` — a link that refuses to
  disclose the referrer is refusing exactly the signal the receiving side's trust rule needs. A stale
  parameter already on the link is replaced, never appended twice. `consentPluginHelper.decorateConsentUrl(url, record,
  opts)` applies every registered plugin's `decorate` to a bare `URL` (no DOM) — the same call a
  programmatic navigation makes, and what `start`'s click handler itself calls after its own
  DOM-only `rel` check.
- **Adopt — every one of these must hold, or the plugin defers (`adopt` returns `null`, meaning
  "ask as today"):**
  - the parameter decodes and its `v` matches;
  - the request's referrer host is a LISTED domain (`document.referrer`, never trusted from the
    parameter itself);
  - `now − t ≤ maxAge` (default 300 s), and `t − now ≤ 60 s` of allowed clock skew the other way;
  - every LOCAL optional category is present in the payload's `c` — a partial payload (fewer
    categories than this site actually asks about) is refused rather than partially applied. A
    sender that still carries a category the receiver has dropped is harmless (the extra key is
    ignored); a sender that has dropped one the receiver still asks about is refused, and the
    receiver asks again rather than guess — release the packages of both ends together.

  `consentStore.init` calls `consentPluginHelper.adoptConsent(opts)` **only when this document has no stored record
  yet, or only an automatic one** — an existing explicit decision always wins, the same rule the
  ordinary "ask" path already follows.
  On success it writes the adopted record (`consentStorageHelper.writeConsent`) before ever publishing/applying — the dialog
  never flashes open for a decision that is about to be adopted.
- **Stripping is unconditional and separate from the trust decision.** Whether or not adoption
  succeeded, the parameter is removed from the address bar with `history.replaceState`
  (`consentLinkHelper.stripConsentLinkParam`), keeping every other query parameter and the hash. A refused parameter
  (foreign referrer, stale, partial) is exactly as much noise in the URL as an adopted one.
- **`consentPluginHelper.consentDomains(opts)`** — every domain the current decision is disclosed as applying to:
  the current host plus every registered plugin's own `domains(opts)`, deduplicated. A component
  that already has `opts.linker.domains` in hand (most do) computes the same list directly instead
  of depending on plugin-registration timing; this helper is for a caller that does not.

## Language rides the same link (`linker.language`)

A visitor who read the marketing site in Polish should meet the platform in Polish. The language
travels in the same `owlcc` payload (`l`), under the same trust decision, and is configured on the
same `linker`:

```typescript
interface ConsentLinkerLanguage {
  supported?: string[]   // RECEIVING side: what this app can render. Omit → this site only SENDS.
  storageKey?: string    // RECEIVING side: where an explicit choice lives. Default `owlmeans-lng`.
}
```

- **Sending** is switched on by the mere presence of `linker.language` (`{}` is enough). The value
  is the page's `<html lang>` — the one signal every page has — lower-cased and shape-checked; a page
  with none carries no `l`. Sending needs no decision on the sending side: `decorate`'s `record` is
  `null` before the visitor has decided, and a link with a language but no decision carries `c: {}`
  (the receiver may hold a decision of its own — see the next rule).
  `consentLinkHelper.encodeConsentLink(record | null, opts)` and `consentPluginHelper.decorateConsentUrl(url, record | null, opts)` take
  that `null`; a plugin's `decorate` receives it.
- **Receiving** is switched on by `language.supported`. `adoptLanguage` (`ConsentPlugin`) shares
  `trustedPayload` with `adopt` — parameter decodes, fresh, referrer host LISTED — so there is one
  trust rule, not two. The carried code must be one of `supported`, exactly or by its base tag
  (`de-AT` → `de`), and the answer is the receiver's own spelling. A code the app cannot render
  changes nothing.
- **It is stored unconditionally.** `consentLinkHelper.writeConsentLanguage` writes the carried language to `storageKey`
  whatever the receiving document's decision is — no decision, a refusal, an old record. The
  inline fragment does the same before any bundle exists, and `consentStore.init` repeats it in
  TypeScript for a page without the fragment. There is no pending state, no `CONSENT_LANGUAGE_EVENT`,
  no purge: the language and the decision are independent, and a stored decision still wins over a
  carried one while the language comes through either way.
- **The application has nothing to bind.** `@owlmeans/client-i18n`'s `i18nInstanceHelper.setLanguage` stores the choice
  on every switch and `i18nInstanceHelper.prepareI18n` reads it at every start — no guard, no ordering against the
  consent bootstrap beyond "the fragment writes before `prepareI18n` reads". `web-panel/consent`'s
  `installConsentLanguage()` survives only as a deprecated no-op, so a generated target that floats
  to a newer release and still calls it keeps building; do not call it in new code. A page with no
  bundle at all (owlmeans.com's inline language switcher) writes its own language keys directly.
- **It overwrites.** `consentLinkHelper.writeConsentLanguage` replaces whatever the receiver stored under
  `storageKey`: the carried language is the one the visitor was just reading, which outranks a
  choice made on this domain some other day. That is `CONSENT_LANGUAGE_KEY` (`owlmeans-lng`) by
  default — `@owlmeans/client-i18n`'s `LNG_STORAGE_KEY`, repeated here because this package has no
  dependencies and the fragment below must run before any bundle exists.
- **When it runs matters more than what it does.** `client-i18n` resolves the initial language from
  storage before the first render, so the write has to land BEFORE that: the inline fragment
  (`consentLinkHelper.consentLinkerScript`) does it in `<head>`. `consentStore.init` repeats it in TypeScript
  (`consentPluginHelper.adoptConsentLanguage` + `consentLinkHelper.writeConsentLanguage`, before the strip) for a host that calls it ahead
  of its own i18n bootstrap — but an app that only mounts the dialog, after `i18nInstanceHelper.prepareI18n`, gets
  its language from the fragment or not at all. So a build with no tag manager must still stamp the
  fragment on its own: `consentLinkHelper.consentLinkerScript({ linker })` (viable's `vite.config.ts` does, when
  `GTM_ID` is empty).
- The fragment mirrors `supportedLanguage` + `consentLinkHelper.writeConsentLanguage` in hand-rolled JS and runs
  AFTER its consent part, behind the same trust checks (referrer, freshness) — nothing about the
  stored decision gates it, an unparseable one included (which is still not adopted over). Without
  `language.supported` no language code is emitted.

## Order: adopt-and-strip runs before either storage read

**The inline head script adopts and strips BEFORE it reads storage.**
`consentTrackingHelper.consentBootstrapScript(opts)` embeds `consentLinkHelper.consentLinkerScript(opts)`
(hand-rolled JS mirroring `consentLinkHelper.consentLinker().adopt` exactly) first when `opts.linker`
is set — an empty string, and no change to the emitted script, otherwise. A provider's head bootstrap
embeds the same fragment right after declaring its defaults, inside its own idempotency flag
(connect's Consent Mode bootstrap does). Because the fragment WRITES an adopted record into the same
`localStorage`/cookie pair `consentStorageHelper.writeConsent` uses, the bootstrap's own storage read
(right after it) and `consentGateScript`'s separate read (concatenated after the whole bootstrap
IIFE) both pick the adopted decision up for free — neither needed its own adoption logic.

`consentStore.init` repeats the same adopt-then-strip dance in real TS for a page that carries no
head script at all (`consentLinkHelper.stripConsentLinkParam`, called unconditionally whenever `opts.linker` is set,
whether or not anything was adopted) — idempotent with the inline fragment: whichever ran first
already stripped the parameter, so the second finds nothing and does nothing.

`@owlmeans/astro`'s `astroHelper.owlHeadScripts` also returns the SAME fragment standalone, as `adopt` — for a
page that does not (or must not) stamp `head` at all. See `/astro` and `/web-gtm`.

## Services

A category says WHY something is stored; a `ConsentService` says WHO receives it — the part a
regulator actually reads:

```typescript
interface ConsentService {
  name: string          // "Example Analytics"
  provider: string      // "Example Corp"
  category: string      // the ConsentCategory.key it runs under
  purpose?: string
  cookies?: string[]    // ['_ex', '_ex_<ID>']
  privacyHref?: string  // the provider's own policy
}
```

It is plain data, not translation keys: whatever adds a tag knows what it is and says so — a tag's
package ships its disclosure (`googleTagHelper.googleTagServices(id)` from connect's `@owlmeans/web-gtm`
for a Google tag). Services
change nothing about what is asked or stored — they are disclosure only, passed to the policy page.

## The policy page

`CookiePolicy` states only what the widget provably does — each category in force with its label,
its `Required` marking and its description, the storage key, the dual storage and the retention —
all read from the same configuration the dialog renders. Given the same `geo`, it adds the regional
rule (`[data-cookie-policy-regional]`): asked only where the law requires it, on by default
elsewhere, Global Privacy Control honoured. It does not enumerate any vendor's signals: the
category description is the whole disclosure of what a category drives. That is why
the page is generated rather than written: a hand-written policy drifts the first time a category
changes, and nobody notices because nobody reads it until it matters.

The one thing it cannot derive is who receives data, so `services` lists each `ConsentService`
inside the item of the category that gates it. A service whose category is not in force is listed
in a trailing "Other services" item, never dropped — an undisclosed service is worse than one
disclosed in the wrong place.

Everything OwlMeans cannot assert on the operator's behalf is deferred to their own privacy policy
and terms.

## Legal pages carry no tracking

A legal page is where a visitor goes to READ what is collected; collecting there while they read is
the one thing it must not do. `astroHelper.isLegalPath` (`@owlmeans/astro`) is the test; the rule predates this
package and stays.

**The linker's standalone `adopt` fragment is the one exception, and it is not really an
exception.** owlmeans.com stamps `astroHelper.owlHeadScripts(...).adopt` first in `<head>` on every page,
legal ones included — see `/astro`. Adopting a cross-domain cookie-consent CHOICE sets no tracking
cookie of its own and signals nothing to any tag; it only mirrors a decision the visitor already
made elsewhere into this document's own consent-state storage, which the site's own cookie policy
already classifies as necessary. `tags.head` (the tag container itself) stays suppressed
on a legal page exactly as before.

## Related

`login-methods` (the consent gate in front of signing in) · `login-plugins` · `web-panel` ·
`web-gtm` (OwlMeans connect — Google Consent Mode and the Google tag)
