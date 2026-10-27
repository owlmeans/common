---
name: dialog
description: Mounting CookieConsent once — its surfaces (locating spinner, bar, preferences window), its props, the re-open button, the linker line, the bar, focus, and the login-raised window.
metadata:
  purposes: consent, dialog, layout
  mentions: CookieConsent, CookieConsentProps, ConsentDisplayMode, CONSENT_DEFAULT_MODE, noReopenButton, policyHref, ConsentGeoOptions, ConsentLinkerOptions, barClassName, data-consent-dialog, data-consent-bar, data-consent-reopen
---

# @owlmeans/web-consent — The dialog and the bar

## Mounting the dialog

`CookieConsent` is mounted **once**, at the application root or in the layout. It opens itself when
no decision is stored, renders nothing but the re-open button once one is, and needs no state from
the caller. One surface at a time:

- **while a first-time visitor is located** (`geo`): a transparent overlay that blocks the page,
  and a spinner (`[data-consent-locating="first"]`, `[data-consent-spinner]` after
  `CONSENT_LOCATING_DELAY`, 300 ms) — never the bar;
- **the first ask** (`reason: 'initial'`) in `bar` mode, the default: the bar;
- **every other opening** — the bar's own "Cookie preferences" (`'preferences'`), a footer link or
  the corner button (`'reopen'`), the sign-in gate (`'login'`) — and the first ask in `window`
  mode: the preferences window.

`[data-consent-dialog]` (with `role="dialog"`, `aria-modal`) and `[data-consent-accept-all]` sit on
whichever surface is up, so a test or a host keys on them without knowing the mode;
`data-consent-mode="bar|window"` and `[data-consent-bar]` tell them apart. "Cookie preferences"
REPLACES the bar with the window — exactly one of each exists at a time.

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
  reduced to its base (`pl-PL` → `pl`), and anything outside `CONSENT_LOCALES` falls back to English.
- `policyHref` is a plain string, so an app-resolved path, a framework route and a raw href all
  work — the component must not know how its host does routing.
- `noReopenButton` hides the floating button for an app that offers a footer link instead; that link
  calls `consentStore.open('reopen')`.
- **`mode`** (`'bar'` | `'window'`, default `CONSENT_DEFAULT_MODE`) picks the first ask's surface.
- **`geo`** (`ConsentGeoOptions`, plain data — an Astro island can pass it) turns on the geo gate:
  `geo={{ cloudflare: true }}` on a Cloudflare-proxied host. It is passed through to
  `consentStore.init` like `linker`; the `consent` skill's "Where consent is asked" is the model. A
  locator plugin is code and is registered, not passed. Pass the same `geo` to `CookiePolicy`.
- **The re-open button is a bare icon in the very corner (`bottom-1 left-1`), not a card.** No
  filled background, no border, no shadow, no hover-scale — `bg-transparent`, dimmed
  (`opacity-70`) at rest and picked out on hover/focus — because it sits on every page of a site
  for as long as a visitor stays and must read as a small fixture rather than compete with the
  page's own controls. The pictogram is 20px (`h-5 w-5`) inside an invisible 44px hit area
  (`h-11 w-11`). `[data-consent-reopen]` is what any test or CSS override keys on.
- **`linker` (`ConsentLinkerOptions`)** turns on cross-domain consent (see the `consent` skill's
  plugin-seam section): `<CookieConsent linker={{ domains: ['owlmeans.com', 'owlmeans.pl'] }} />`
  passes it straight to `useConsent`, which registers `consentLinkHelper.consentLinker` on mount. With it set and
  more than just the current host to disclose, a domain line renders right after the description
  (`[data-consent-domains]`, added to the dialog's `aria-describedby`) — computed DIRECTLY from
  `linker.domains` plus the current host, not through the plugin registry, so it never depends on
  registration having finished yet. Omit `linker` and nothing here changes at all. The same object
  carries `language` (`{}` to send the page's language, `{ supported }` to adopt one — the `consent`
  skill's language section): the dialog only forwards it to the store and discloses nothing extra.
- **The interface language is not a category.** The default set renders the required row and the
  analytics and marketing toggles only; the language is strictly necessary storage that no toggle
  governs (the `consent` skill). The built-in bundle (8 languages) describes it in the required row.
- `silent` skips every `dataLayer` and global write. It is for tests and for an app that runs no
  tags at all.
- The window's switches are **seeded from storage every time it opens** — it is mounted only while
  open — never from the last render: a visitor reopening preferences must see the answer they gave.
  An automatic decision past its age seeds nothing.

**When the window was raised by something waiting on it** — `reason === 'login'`, which the sign-in
precondition in `@owlmeans/client-iam` raises — it says so and relabels the primary action *Accept
& continue*. The sign-in gate always gets the window, never the bar. An automatic decision is said
to be one when the window opens over it (`[data-consent-auto]`, `autoReason`). That is what makes the interruption legible instead of looking like the page asking
twice. Word that path as an acknowledgement, never as "you must consent to essential cookies": a
required category is disclosure, not a question.

## The bar

A tall bar across the bottom of a **dimmed** overlay (`[data-consent-overlay]`,
`fixed inset-0 bg-black/70`): the page stays in sight and scrolls, but nothing on it can be
pressed until the visitor answers. The bar (`fixed inset-x-0 bottom-0 max-h-[85vh] border-t
bg-background`) holds, left to right on a wide screen and stacked on a phone:

- the cookie icon and `barTitle`;
- `barDescription` — what the essential cookies do, the optional categories in force as a list
  after a colon (`{{categories}}`, so no language has to decline a label), that they stay off until
  allowed, and that the choice can be changed or withdrawn at any time; `barDescriptionEssential`
  when nothing is optional;
- the cross-domain line (`[data-consent-domains]`) when `linker` names more than this host;
- the links row (`[data-consent-links]`: `policyHref` then `links`, 44px targets, new tab);
- three answers: `[data-consent-preferences]` "Cookie preferences" (outlined), then
  `[data-consent-mandatory]` "Accept only mandatory" and `[data-consent-accept-all]` "Accept All" —
  the two answers carry the SAME accent class: refusing is exactly as prominent as accepting, and
  one click away. With no optional category there is nothing to refuse, so "mandatory" is absent.

`barClassName` styles the bar; `className` still styles the window's card.

**Focus.** On open, focus moves to the surface itself (`tabIndex={-1}`) — never to an answer, which
would be a nudge; Tab and Shift+Tab cycle inside it; on close focus returns where it was. Nothing
pulls focus back on `focusin` (a script focusing a field is not a keyboard user escaping). The
spinner overlay takes no focus.
