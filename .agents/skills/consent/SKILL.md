---
name: consent
description: How to use @owlmeans/consent and @owlmeans/web-consent — the cookie-consent model, its categories and global-variable seam, the storage contract and its migration, Consent Mode v2 signalling, and the ordering rule that makes a tag manager honour any of it. Auto-invoked when touching consent categories, the dialog, the cookie policy page, or a tag-manager snippet.
user-invocable: false
metadata:
  scope: general
---

# Cookie consent

Three packages, split so the one an island loads stays small and the one that knows about Google is
optional:

| Package | Layer | Holds |
|---|---|---|
| `@owlmeans/consent` | Core, **zero runtime dependencies** | categories, storage, the observable store, the Consent Mode surface, the built-in copy |
| `@owlmeans/web-consent` | Web (React) | the dialog, the re-open button, `CookiePolicy`, `useConsent` |
| `@owlmeans/web-gtm` | Web | the tag-manager loader and its head snippet |
| `@owlmeans/web-panel/consent` | subpath | the same components, bound to OwlMeans i18n and language |

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

The default set is `essential` (required), `analytics`, `marketing` — what owlmeans.com already
asked, plus the essential row the original widget left implicit. Making it explicit is what lets a
flow require an acknowledgement before it sets a session cookie, and what tells a visitor what is
stored regardless.

`globalVar` is the seam for anything that cannot subscribe: a GTM custom-HTML tag reading a flag, a
hand-placed pixel, a script that runs once. Globals are written **before** the signal update, so a
tag firing on that update reads them in the same turn.

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
`gtmHeadScript()` emits it followed by the container.

Every consumer stamps it from HTML:

- `manager-web` — a Vite `transformIndexHtml` plugin, so the snippet cannot drift from the package.
- owlmeans.com — `owlHeadScripts()` from `@owlmeans/astro`, `set:html` in `Base.astro`.
- a generated target — its `rollup.config.js` emits it into the `<head>` it writes.

`pushConsentDefaults` is idempotent through `window.cookieConsentSetup`: a page may carry the call
twice, and a second `default` after a tag has loaded can WIDEN what was already narrowed.

`gtagConsent` pushes `arguments`, not an array literal — that is the shape `gtag.js` itself emits,
and a page carrying both snippets should not have two shapes in one queue.

## The store

`consentStore` is a module singleton, and deliberately so: consent is a property of the DOCUMENT,
not of a component tree, and it has to be reachable from places that are not React — the sign-in
precondition runs inside a click handler.

`useConsent()` subscribes through `useSyncExternalStore`; `openConsent(reason)` and
`isConsented(key)` are the imperative readers.

## The policy page

`CookiePolicy` states only what the widget provably does — the categories in force, the storage key,
the dual storage, the retention, the signals each drives — all read from the same configuration the
dialog renders. That is why it is generated rather than written: a hand-written policy drifts the
first time a category changes, and nobody notices because nobody reads it until it matters.

Everything OwlMeans cannot assert on the operator's behalf is deferred to their own privacy policy
and terms.

## Legal pages carry no tracking

A legal page is where a visitor goes to READ what is collected; collecting there while they read is
the one thing it must not do. `isLegalPath` (`@owlmeans/astro`) is the test; the rule predates this
package and stays.

## Related

`login-methods` (the consent gate in front of signing in) · `login-plugins` · `web-panel`
