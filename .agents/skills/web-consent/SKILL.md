---
name: web-consent
description: How to use @owlmeans/web-consent — the React cookie-consent dialog, its re-open button, the generated cookie-policy page and the useConsent hooks, plus the Tailwind @source line every consumer must add. Auto-invoked when mounting a consent dialog, rendering a cookie policy, gating a feature on a consent category, or importing CookieConsent, CookiePolicy or useConsent.
user-invocable: false
---

# @owlmeans/web-consent

**Layer:** Web (React)
**Install:** `"@owlmeans/web-consent": "^0.1.18-rc.7"` in `dependencies`

The browser components of the consent set. The model — categories, storage, migration, the store,
Consent Mode signalling — is `@owlmeans/consent`, and this package re-exports a **named selection**
of it (listed under Key Exports) so an application usually has one import. Five public
`@owlmeans/consent` exports are deliberately not in that list — `makeConsentStore`,
`normalizeLocale`, `CONSENT_SETUP_FLAG`, `CONSENT_SIGNAL_DEFAULTS` and the `ConsentListener` type —
so a caller that needs one of them imports it from `@owlmeans/consent` directly. **Read the
`consent` skill for the model; read this one for the components.**

## Deliberately not a shadcn package

It uses **no shadcn primitive and no `@` alias**, and owns a four-line `cn` of its own. The `@`
contract exists so a consumer's THEME and primitives win — `cn` has neither in it, and requiring an
alias for it would mean adopting an OwlMeans UI contract before you may render a consent notice.
One of the surfaces that needs this dialog most is a static site with its own component library and
no such alias, where that would simply fail to build.

For the same reason it is not part of `@owlmeans/web-panel`: that would drag ~30 packages onto a
cookie notice. `@owlmeans/web-panel/consent` is the thin binding to OwlMeans i18n on top of these
components — see below.

## Key Exports

| Export | Description |
|--------|-------------|
| `CookieConsent` | The preferences dialog **and** the persistent re-open button |
| `CookiePolicy` | The cookie-policy page, generated from the configuration in force |
| `ConsentToggle` | One category row — locked and labelled when the category is required |
| `useConsent(opts?)` | This document's consent state and the actions over it (`UseConsentModel`) — **it also initialises the store on mount**, see below |
| `useConsentCategory(key)` | Whether one category is granted, for a component gating a single thing |
| `CookieConsentProps` / `CookiePolicyProps` / `ConsentLink` | The component props |
| Re-exports from `@owlmeans/consent` | The complete list: `consentStore`, `openConsent`, `isConsented`, `readConsent`, `writeConsent`, `clearConsent`, `migrateConsent`, `applyConsent`, `pushConsentDefaults`, `consentBootstrapScript`, `consentDefaults`, `consentUpdate`, `gtagConsent`, `DEFAULT_CONSENT_CATEGORIES`, `DEFAULT_CONSENT_MESSAGES`, `defaultConsentTranslate`, `interpolate`, `CONSENT_KEY`, `CONSENT_COOKIE_DAYS`, `CONSENT_SCHEMA_VERSION`, `CONSENT_LOCALES`, `CONSENT_ESSENTIAL` / `CONSENT_ANALYTICS` / `CONSENT_MARKETING`, and the types `ConsentCategory`, `ConsentOptions`, `ConsentReason`, `ConsentRecord`, `ConsentSignal`, `ConsentState`, `ConsentStore`, `ConsentLocale` |

## Mounting the dialog

`CookieConsent` is mounted **once**, at the application root or in the layout. It opens itself when
no decision is stored, renders nothing but the re-open button once one is, and needs no state from
the caller:

```tsx
import { CookieConsent } from '@owlmeans/web-consent'

<CookieConsent
  policyHref="/legal/cookies"
  links={[{ href: '/legal/privacy', labelKey: 'privacy', defaultLabel: 'Privacy Policy' }]}
/>
```

- **The category set the dialog renders is the set it saves.** Pass `categories` here and pass the
  same set to whatever stamps the head snippet, or the two disagree about what was asked. The same
  goes for `storageKey`, `cookieDays` and `cookieDomain`.
- `locale` picks the packaged language; leave it unset and English is used, so an app with a
  language of its own passes it (or mounts `PanelCookieConsent`, which does). A region tag is
  reduced to its base (`pl-PL` → `pl`), and anything outside the seven falls back to English.
- `policyHref` is a plain string, so an app-resolved path, a framework route and a raw href all
  work — the component must not know how its host does routing.
- `noReopenButton` hides the floating button for an app that offers a footer link instead; that link
  calls `openConsent('reopen')`.
- `silent` skips every `dataLayer` and global write. It is for tests and for an app that runs no
  tags at all.
- The draft is **re-seeded from storage every time the dialog opens**, not from the last render — a
  visitor reopening preferences must see the answer they gave.

**When the dialog was raised by something waiting on it** — `reason === 'login'`, which the sign-in
precondition in `@owlmeans/client-iam` raises — it says so and relabels the primary action *Accept
& continue*. That is what makes the interruption legible instead of looking like the page asking
twice. Word that path as an acknowledgement, never as "you must consent to essential cookies": a
required category is disclosure, not a question.

## Reading the decision

```tsx
import { useConsent, useConsentCategory, isConsented } from '@owlmeans/web-consent'

const consent = useConsent()          // { record, open, reason, granted, save, acceptAll, openDialog, close }
const analytics = useConsentCategory('analytics')   // one category, for a component gating one thing
if (isConsented('analytics')) { /* outside React — a click handler, a service */ }
```

Both hooks subscribe through `useSyncExternalStore` over the module-singleton store, because consent
is a property of the DOCUMENT rather than of a component tree: the dialog, the re-open button, the
policy page and whatever an app gates on it all read one value, and local copies would disagree the
moment one of them saved. During server rendering the snapshot is "no record, closed", so the dialog
never flashes into static HTML before hydration corrects it.

**`useConsent` is not a pure reader — it runs `consentStore.init(opts)` on mount.** Two consequences
a component that only wanted to read has to plan for:

- **It opens the dialog.** `init` reads storage, and with no stored record it publishes
  `open: true, reason: 'initial'`. So a `useConsent()` in a card that merely wanted `granted('analytics')`
  gates the page for a first-time visitor. Read a single category with `useConsentCategory(key)` —
  that hook subscribes and does **not** init — or `isConsented(key)` outside React.
- **The first `useConsent` to mount fixes the Consent Mode defaults.** `init` calls
  `pushConsentDefaults`, which is idempotent through the `CONSENT_SETUP_FLAG` window flag: whoever
  gets there first declares the `consent/default` signals from *its* categories, and every later
  call returns immediately. A bare `useConsent()` mounting before `CookieConsent` therefore declares
  `DEFAULT_CONSENT_CATEGORIES`' signals and the app's own `categories` never declare theirs — which
  silently breaks the parity rule above. Pass the app's `opts` wherever `useConsent` is called, or
  do not call it outside the dialog.

`opts` are read on the mounting pass only (the effect's dependency list is empty), so changing them
in a later render has no effect on that mount.

## The policy page

`CookiePolicy` states only what the widget provably does — the categories in force, the storage key,
the dual storage, the retention — all read from the same configuration the dialog renders. That is
why it is generated rather than written: a hand-written policy drifts the first time a category
changes, and nobody notices because nobody reads it until it matters.

```tsx
<CookiePolicy operator="Example Sp. z o.o." privacyHref="/legal/privacy" termsHref="/legal/terms" />
```

Everything OwlMeans cannot assert on the operator's behalf — who the controller is, the lawful
basis, how to exercise rights — is deferred to those two links. It also renders a *Manage
preferences* control, so the policy page is a way back into the decision.

## Tailwind — one `@source` line, pointing at `src`

The components emit Tailwind classes that exist nowhere in the consumer's own sources, and
Tailwind's scanner reads the CSS root plus `@source` directives only, excluding `node_modules`. Add
the line to the app's Tailwind entry:

```css
@import "tailwindcss";

@source "<relative path to node_modules>/@owlmeans/web-consent/src";
```

**Point it at `src`, never at `build`.** The scanner applies the `.gitignore` of whatever repository
a path resolves into, and under a linked workspace the `node_modules` entry is a symlink into a
monorepo where every package's build output is ignored. A `build` source there scans **zero files
and reports nothing**: the build succeeds, the CSS is emitted, and the dialog renders *half*-styled
— the utilities the app happens to use elsewhere still exist while the ones only this package asks
for (`max-w-lg`, `bg-black/70`, `z-[999998]`) do not. What reaches the screen is a full-width,
backdrop-less dialog with the page bleeding through, and nothing in the app's sources looks wrong.
`src` is tracked and ships in the published tarball, so one path serves both a linked checkout and
an npm install.

The failure is silent, so verify rather than assume — grep the emitted stylesheet for a class only
this package uses:

```sh
grep -c 'max-w-lg' dist/assets/*.css
```

A `*/` inside a CSS comment ends it early, so a comment above an `@source` that spells out a glob
closes the comment at that star-slash and turns the next `@source` into an invalid declaration.
Describe a glob in words, or keep it out of the comment.

## i18n

Given no `translate` prop, the components resolve every string through the packaged bundle for
`locale` — seven languages, the same set the framework supports. **Once a `translate` prop is given,
the packaged bundle is not consulted at all**, so a wrapper that forwards a framework resolver alone
renders the English default for every key the application has not overridden, in every language. The
resolver must fall through to `defaultConsentTranslate(locale)` for the default — which is exactly
what `@owlmeans/web-panel/consent` does, and why an app inside the panel family mounts
`PanelCookieConsent` / `PanelCookiePolicy` rather than these components directly.

`ConsentToggle` is exported for a host that builds its own dialog body; the wording it shows is the
caller's, already resolved.

## Depends On

- `@owlmeans/consent` — the model; the named selection above is re-exported from this package's root
- Peers (app-provided): `react`, `tailwindcss`, `tailwind-merge`, `clsx`, `lucide-react`

## Related

- `consent` — the model: categories, `globalVar`, storage and migration, Consent Mode v2, the
  ordering rule. Read it before changing anything a category means
- `web-gtm` — the head snippet that carries a stored decision to the tag manager
- `astro` — stamping that snippet from a static site's layout
- `login-methods` / `login-plugins` — the sign-in precondition that raises this dialog with
  `reason: 'login'`
- `web-panel` — its `./consent` subpath, the OwlMeans-i18n binding of these components
