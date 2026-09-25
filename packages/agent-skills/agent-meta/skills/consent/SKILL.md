---
name: consent
description: How to use @owlmeans/consent and @owlmeans/web-consent — the cookie-consent model, its categories and global-variable seam, the storage contract and its migration, Consent Mode v2 signalling, and the ordering rule that makes a tag manager honour any of it. Auto-invoked when touching consent categories, the dialog, the cookie policy page, or a tag-manager snippet.
user-invocable: false
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Cookie consent

Three packages, split so the one an island loads stays small and the one that knows about Google is
optional:

| Package | Layer | Holds |
|---|---|---|
| `@owlmeans/consent` | Core, **zero runtime dependencies** | categories, storage, the observable store, the Consent Mode surface, the built-in copy |
| `@owlmeans/web-consent` | Web (React) | the dialog, the re-open button, `CookiePolicy`, `useConsent` |
| `@owlmeans/web-gtm` | Web | the Google tag head snippet (container or gtag.js), its CSP hosts and its cookie-policy disclosure |
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
  globalVar?: string       // window[globalVar] = granted, written BEFORE the dataLayer push
  signals?: ConsentSignal[]// Consent Mode v2 signals this category drives
  event?: string           // dataLayer event pushed when it flips to granted
}
```

The default set is `essential` (required), `functional`, `analytics`, `marketing` — what owlmeans.com
already asked, plus the essential row the original widget left implicit (what lets a flow require an
acknowledgement before it sets a session cookie, and tells a visitor what is stored regardless), plus
`functional`: the visitor's own remembered preferences — today the interface language.

**`functional` drives NO Consent Mode signal, on purpose.** A signal would make `trackingGranted`
count it (an optional category with a signal is "tracking"), and a visitor who only allowed their
language to be remembered would load the tag container. Anything that stores a preference asks
`functionalGranted(opts)` (or writes through `writeFunctionalPreference`) — never `analytics`, never
"a decision exists": a refusal is an answer, and tying a language to analytics would bundle purposes.

**A record saved before the category existed has no `functional` key, and that is NOT a grant** — the
visitor was never asked. It is not re-asked either (a new question is not worth the dialog re-opening
for everyone); `granted('functional')` is `false`, "Accept all" and the preferences dialog grant it.
`functionalKeys` (default: the language key) lists the `localStorage` keys that may exist only while
it is granted: `init` and `save` remove them the moment it is not, so a preference never outlives the
consent to remember it. A category set of your own with no `functional` key can therefore never store
a preference — deliberately: the safe failure.

`globalVar` is the seam for anything that cannot subscribe: a GTM custom-HTML tag reading a flag, a
hand-placed pixel, a script that runs once. Globals are written **before** the signal update, so a
tag firing on that update reads them in the same turn. A category's `event` is pushed **after** the
update, and only while the category is granted.

`CONSENT_SIGNAL_DEFAULTS` is the pre-decision value of every Consent Mode v2 signal: `denied` for
all of them except `security_storage`, which is `granted` on Google's own documented
recommendation because it covers strictly-necessary uses such as fraud prevention. `consentDefaults`
declares only the signals some configured category actually names, so a site that drops the
marketing category does not announce ad signals it never uses. A signal claimed by two categories is granted only when **every**
one of them is.

> **A required category is disclosure, not a question.** Strictly-necessary storage does not need
> consent under ePrivacy, and a dialog that presents it as a choice is itself a dark pattern. Never
> word the login gate as "you must consent to essential cookies" — it records an acknowledgement
> before a flow that sets a session cookie.

## Storage

`site_cookie_consent`, JSON, written to **both** localStorage and a 365-day `path=/` cookie,
localStorage read first. The key and the dual write are unchanged from the widget this
generalises, and must stay unchanged: owlmeans.com has visitors who already chose.

**Migration is the load-bearing part.** A record with no `v` predates the explicit essential
category, when it was implicitly on. It is upgraded IN PLACE (`essential: true`, `v: 2`) rather
than treated as unusable — the visitor did decide, and re-asking is a regression they experience as
the site forgetting. `cookieDomain` stays unset by default for the same reason: setting one orphans
the existing host-only cookie.

`SameSite=Lax` is stated explicitly; browsers differ on the default, and this cookie is never sent
cross-site.

## The ordering rule

**`consent/default` must be pushed by an inline script ABOVE the tag-manager snippet.** Consent
Mode decides what a tag may do from the state present when the container loads, and a React bundle
cannot get there first: by the time an island mounts, the container has been running for hundreds of
milliseconds and has already decided.

`consentBootstrapScript()` is that script — it declares the defaults AND reads the stored record, so
a returning visitor's tags are not denied for the first paint of every page. `@owlmeans/web-gtm`'s
`googleTagHeadScript()` emits it followed by ads redaction and the loader for any Google id
(`GTM-` container, `G-`/`GT-`/`AW-`/`DC-` gtag.js), and yields the bootstrap alone for an invalid
id; `gtmHeadScript()` is the older container-only form.

Every consumer stamps it from HTML:

- `manager-web` — a Vite `transformIndexHtml` plugin, so the snippet cannot drift from the package.
- owlmeans.com — `owlHeadScripts()` from `@owlmeans/astro`, `set:html` in `Base.astro`.
- a generated target — its `rollup.config.js` emits `googleTagHeadScript({ id })` into the
  `<head>` it writes when the project owner set a Google tag, and `consentBootstrapScript()`
  otherwise, in preview and production alike.

Consent Mode speaks on `window.dataLayer` only — the bootstrap, `gtagConsent` and
`applyConsent` all push there — so a tag loaded onto another queue never hears a consent command.

`pushConsentDefaults` is idempotent through `window.cookieConsentSetup`: a page may carry the call
twice, and a second `default` after a tag has loaded can WIDEN what was already narrowed.

`gtagConsent` pushes `arguments`, not an array literal — that is the shape `gtag.js` itself emits,
and a page carrying both snippets should not have two shapes in one queue.

## Gated loading (`trackingGranted`, `consentGateScript`, `CONSENT_EVENT`)

Consent Mode signals (above) tell a LOADED tag what it may do; they say nothing about whether the
tag should be requested at all. `@owlmeans/web-gtm`'s gated `'basic'` loading mode (its default —
see `/web-gtm`) is built from three small primitives that live here, not there, so any loader —
including one in a target project — can reuse the same gate without depending on `web-gtm`:

- **`trackingGranted(record, categories?)`** — whether a stored/applied `ConsentRecord` grants
  tracking at all: some category that is both NOT `required` and drives at least one Consent Mode
  signal is `true` in the record. A required category (however many signals it drives, like
  `essential`'s `security_storage`) never counts — it is disclosure, not a question, and everyone
  gets it regardless.
- **`CONSENT_EVENT`** (`'owlmeans:consent'`) — the DOM event `applyConsent` dispatches on `window`
  after it finishes writing globals and pushing the Consent Mode update, with `detail: { record }`.
  It is the only way a loader that already ran — and decided, on first paint, not to load yet — can
  hear a LATER grant: Consent Mode itself speaks only on `dataLayer`, which nothing not yet loaded
  is listening to. Guarded so it never throws where `CustomEvent`/`dispatchEvent` are not shimmed
  (tests, SSR).
- **`consentGateScript(loaderExpr, opts?)`** — the inline-safe counterpart to
  `consentBootstrapScript` for withholding a loader rather than declaring defaults for one: it
  inlines the SAME localStorage-then-cookie lookup the bootstrap uses, and either runs `loaderExpr`
  immediately (a returning visitor already satisfies `trackingGranted`) or attaches a one-shot
  `CONSENT_EVENT` listener that runs it on the first grant and removes itself. `loaderExpr` is a
  complete, already-self-invoking statement (the same shape `gtmContainerScript`/`gtagScript`
  produce) — `consentGateScript` embeds it verbatim rather than calling it, so the caller controls
  exactly what "the loader" means. Like `consentBootstrapScript`, it does not itself escape `</` or
  `<!--` for HTML — escaping the composed result inline is the caller's job (`googleTagHeadScript`
  already does it over its whole output, gated loader included).

## The store

`consentStore` is a module singleton, and deliberately so: consent is a property of the DOCUMENT,
not of a component tree, and it has to be reachable from places that are not React — the sign-in
precondition runs inside a click handler.

`consentStore.init(opts)` is what starts it: push the defaults, read and migrate the stored record,
apply it, and open the dialog when there is none. `useConsent()` calls it on mount, and
`loadGtm` calls it before the container — a host that mounts neither calls it itself, once, with
the same options everything else was given.

`useConsent()` subscribes through `useSyncExternalStore`; `openConsent(reason)` and
`isConsented(key)` are the imperative readers.

`silent: true` in `ConsentOptions` suppresses the **runtime** pushes — `pushConsentDefaults` and
`applyConsent` both return before touching the queue or the category globals — while leaving storage
and the dialog intact. It is for tests and for an application that runs no tags. It does **not**
reach the stamped snippet: `consentBootstrapScript` ignores the flag, and the string it returns
still pushes `consent/default` and, for a stored record, `consent/update`. A surface that must emit
nothing at all does not stamp the bootstrap.

**`consentStore.save` has a second, non-dialog writer.** `@owlmeans/marketing-consent`'s
`MarketingConsentBridge` seam (`@owlmeans/web-marketing-consent`'s `cookieConsentBridge`) calls
`consentStore.save` whenever a person changes a cookie-LINKED item (`trackers.analytics`/
`trackers.advertising`) on that package's own privacy-choices screen or settings card — not only
when the cookie dialog itself is used. Read `web-marketing-consent`'s skill for the direction this
runs (marketing screen → cookie consent, unconditional) and the one it deliberately does NOT run by
default (cookie consent → the saved marketing-consent ledger, `cookieSeed`) — the two are legally
different acts, and only the first is safe to automate unconditionally.

## The plugin seam and cross-domain consent (`consentLinker`)

`ConsentPlugin` (`plugins.ts`) is the extension seam the core package needed to share a decision
between DOMAINS without knowing anything about the mechanism: `{ alias, priority?, start?, adopt?,
adoptLanguage?, decorate?, domains? }`, registered module-globally through `registerConsentPlugin` (replace by
alias, priority-sorted higher first — the same registry shape `client-auth/login`'s method/step
registries use). Nothing here is specific to the one built-in plugin; a host could register its own
for a different sharing mechanism entirely.

`consentLinker()` (`linker.ts`) is that one built-in plugin: it shares a decision between the
domains named in `opts.linker.domains` through a decorated link, so a visitor who already decided
on one first-party domain is not asked again on another. The same link also carries the interface
LANGUAGE (see "Language rides the same link" below).

- **The wire format.** `owlcc` (configurable via `linker.param`) = base64url JSON `{ v: 2, c: {
  <optional category>: 0|1 }, t: <unix seconds>, l?: <language> }` — `encodeConsentLink`/
  `decodeConsentLink`. Only the OPTIONAL categories travel; a required one is always forced `true`
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
  parameter already on the link is replaced, never appended twice. `decorateConsentUrl(url, record,
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
    sender built before `functional` existed carries no such key, so a receiver that asks about it
    refuses that decision and asks again rather than guess: release the packages of both ends
    together.

  `consentStore.init` calls `adoptConsent(opts)` **only when this document has no stored record
  yet** — an existing decision always wins, the same rule the ordinary "ask" path already follows.
  On success it `writeConsent`s the adopted record before ever publishing/applying — the dialog
  never flashes open for a decision that is about to be adopted.
- **Stripping is unconditional and separate from the trust decision.** Whether or not adoption
  succeeded, the parameter is removed from the address bar with `history.replaceState`
  (`stripConsentLinkParam`), keeping every other query parameter and the hash. A refused parameter
  (foreign referrer, stale, partial) is exactly as much noise in the URL as an adopted one.
- **`consentDomains(opts)`** — every domain the current decision is disclosed as applying to:
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
  `encodeConsentLink(record | null, opts)` and `decorateConsentUrl(url, record | null, opts)` take
  that `null`; a plugin's `decorate` receives it.
- **Receiving** is switched on by `language.supported`. `adoptLanguage` (`ConsentPlugin`) shares
  `trustedPayload` with `adopt` — parameter decodes, fresh, referrer host LISTED — so there is one
  trust rule, not two. The carried code must be one of `supported`, exactly or by its base tag
  (`de-AT` → `de`), and the answer is the receiver's own spelling. A code the app cannot render
  changes nothing.
- **It is stored ONLY while `functional` is granted on the receiving document** — by a stored
  record, or by the record adopted from the very link that carries the language. No decision, a
  "reject all", or a record saved before the category existed all mean no: `writeConsentLanguage`
  writes nothing and returns `false`, and the inline fragment skips its write. `adoptLanguage` only
  names a candidate; the gate is in the writer, so no caller can forget it. A stored record still
  wins over a carried decision, and does not stop the language when it grants `functional`.
- **A language that cannot be stored yet is HELD, in memory, and stored when the grant arrives.** The
  inline fragment leaves it on `window[CONSENT_PENDING_LANGUAGE]` (the URL parameter is already
  stripped); `consentStore.init` takes it from there (or from the URL, on a page with no fragment)
  into `pendingLanguage()`. `save()` settles it: a record that grants `functional` writes it and
  dispatches `CONSENT_LANGUAGE_EVENT` (`detail.language`) so the app can switch this very page;
  one that does not leaves it waiting — the visitor may grant later in this page's life — and
  removes every `functionalKeys` entry. It dies with the page: nothing is ever stored, not even in
  `sessionStorage`, before the grant.
- **The application decides how to react.** `@owlmeans/client-i18n` takes a persistence guard
  (`setLanguagePersistence`) — while it says no, `setLanguage` switches the UI but writes nothing,
  remembers the refused choice, and a stored language counts as absent at start-up — and
  `persistLanguage()` writes the refused choice once storage is allowed. `web-panel/consent`'s
  `installConsentLanguage()` wires all of it: guard = `functionalGranted`, `CONSENT_EVENT` →
  `persistLanguage`, `CONSENT_LANGUAGE_EVENT` → `setLanguage` (unless the person already picked one in
  this page's life: what they chose outranks what a link carried). Call it BEFORE `prepareI18n`.
  A page with no bundle at all (owlmeans.com's inline language switcher) asks
  `consentAllowsScript()`'s `window.owlConsentAllows('functional')` before it writes.
- **It overwrites.** `writeConsentLanguage` replaces whatever the receiver stored under
  `storageKey`: the carried language is the one the visitor was just reading, which outranks a
  choice made on this domain some other day. That is `CONSENT_LANGUAGE_KEY` (`owlmeans-lng`) by
  default — `@owlmeans/client-i18n`'s `LNG_STORAGE_KEY`, repeated here because this package has no
  dependencies and the fragment below must run before any bundle exists.
- **When it runs matters more than what it does.** `client-i18n` resolves the initial language from
  storage before the first render, so the write has to land BEFORE that: the inline fragment
  (`consentLinkerScript`) does it in `<head>`. `consentStore.init` repeats it in TypeScript
  (`adoptConsentLanguage` + `writeConsentLanguage`, before the strip) for a host that calls it ahead
  of its own i18n bootstrap — but an app that only mounts the dialog, after `prepareI18n`, gets
  its language from the fragment or not at all. So a build with no tag manager must still stamp the
  fragment on its own: `consentLinkerScript({ linker })` (viable's `vite.config.ts` does, when
  `GTM_ID` is empty).
- The fragment mirrors `supportedLanguage` + `writeConsentLanguage` in hand-rolled JS and runs
  AFTER its consent part, guarded by `fg` — a parseable stored record with `functional` true, or the
  record the fragment itself just adopted with it true — so the gate holds before any bundle exists;
  otherwise it leaves the candidate on `window`. An unparseable stored record is no grant (and is not
  adopted over). Without `language.supported` no language code is emitted.

## Order: adopt-and-strip runs before either storage read

**The inline head script adopts and strips BEFORE it reads storage — placed right after `consent
default`, inside the same idempotency flag `consentBootstrapScript` already guards with.**
`consentBootstrapScript(opts)` embeds `consentLinkerScript(opts)` (hand-rolled JS, the same
discipline `consentGateScript` already follows, mirroring `consentLinker().adopt` exactly) right
there when `opts.linker` is set — an empty string, and no change to the emitted script, otherwise.
Because the linker fragment WRITES an adopted record into the same `localStorage`/cookie pair
`writeConsent` uses, the bootstrap's own storage read (right after it) and `consentGateScript`'s
separate storage read (concatenated after the whole bootstrap IIFE) both pick the adopted decision
up for free — neither needed its own adoption logic.

`consentStore.init` repeats the same adopt-then-strip dance in real TS for a page that carries no
head script at all (`stripConsentLinkParam`, called unconditionally whenever `opts.linker` is set,
whether or not anything was adopted) — idempotent with the inline fragment: whichever ran first
already stripped the parameter, so the second finds nothing and does nothing.

`@owlmeans/astro`'s `owlHeadScripts` also returns the SAME fragment standalone, as `adopt` — for a
page that does not (or must not) stamp `head` at all. See `/astro` and `/web-gtm`.

## Services

A category says WHY something is stored; a `ConsentService` says WHO receives it — the part a
regulator actually reads:

```typescript
interface ConsentService {
  name: string          // "Google Analytics"
  provider: string      // "Google LLC"
  category: string      // the ConsentCategory.key it runs under
  purpose?: string
  cookies?: string[]    // ['_ga', '_ga_<ID>']
  privacyHref?: string  // the provider's own policy
}
```

It is plain data, not translation keys: whatever adds a tag knows what it is and says so.
`googleTagServices(id)` from `@owlmeans/web-gtm` is the disclosure for a Google tag. Services
change nothing about what is asked or stored — they are disclosure only, passed to the policy page.

## The policy page

`CookiePolicy` states only what the widget provably does — each category in force with its label,
its `Required` marking and its description, the storage key, the dual storage and the retention —
all read from the same configuration the dialog renders. It does not enumerate Consent Mode
signals: the category description is the whole disclosure of what a category drives. That is why
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
the one thing it must not do. `isLegalPath` (`@owlmeans/astro`) is the test; the rule predates this
package and stays.

**The linker's standalone `adopt` fragment is the one exception, and it is not really an
exception.** owlmeans.com stamps `owlHeadScripts(...).adopt` first in `<head>` on every page,
legal ones included — see `/astro`. Adopting a cross-domain cookie-consent CHOICE sets no tracking
cookie of its own and pushes nothing to `dataLayer`; it only mirrors a decision the visitor already
made elsewhere into this document's own consent-state storage, which the site's own cookie policy
already classifies as functional/necessary. `tags.head` (the tag container itself) stays suppressed
on a legal page exactly as before.

## Related

`login-methods` (the consent gate in front of signing in) · `login-plugins` · `web-panel`
