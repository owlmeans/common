---
name: consent
description: The ./consent subpath — PanelCookieConsent and PanelCookiePolicy bound to the app's i18n, cfg.cookieConsent, a geo plugin, and the host-menu presence service.
metadata:
  purposes: consent
  mentions: PanelCookieConsent, PanelCookiePolicy, PanelConsentMenuWidget, useConsentMenuPresence, appendConsentWidgetService, appendConsentGeoPlugin, cookieConsent, @owlmeans/web-panel/consent
---

# @owlmeans/web-panel — Cookie consent

## Subpath: `./consent`

`PanelCookieConsent` and `PanelCookiePolicy` — `@owlmeans/web-consent`'s components bound to this
app's language and translations, falling through to the package's own eight-language bundle for
every key the app has not overridden — and to the app's cookie-consent configuration. See the
`consent` and `web-consent` skills.

**The configuration lives in `cfg.cookieConsent`** (`PanelCookieConsentConfig`, on `AppConfig`),
set where the rest of the app's configuration is, before anything renders:

```typescript
cfg.cookieConsent = { geo: { cloudflare: true } }   // ask only in consent countries; mode: 'bar' default
```

- `mode` (`'bar'` | `'window'`) and `geo` (`ConsentGeoOptions`) feed both components; a prop of the
  same name always wins. Not `cfg.consent` — "consent" also names the marketing-consent and sign-in
  terms options.
- A file restored into apps of every age (a generated target's `config.ts`) writes it as
  `Object.assign(cfg, { cookieConsent: … })`, so a tree whose framework predates the key still
  type-checks; an older package ignores it.
- **A locator of the app's own** is code, not configuration: `appendConsentGeoPlugin(context,
  plugin)` in `context.ts` registers a `ConsentGeoPlugin` (`{ alias, locate }` — resolve the country
  or throw) ahead of Cloudflare's and installs `context.consentGeo()`. Appending one IS asking for
  the gate: `PanelCookieConsent` turns it on (`geo: {}`) even where `cfg.cookieConsent.geo` says
  nothing. `PanelCookiePolicy` reads the same, so the policy states the regional rule exactly when
  the dialog applies it.

A re-export does not move Tailwind class strings, so a consumer adds a second `@source` for
`@owlmeans/web-consent` alongside this package's — pointing at **`src`**, for the reason spelled out
under *Consumer setup — package boundary and Tailwind* in [SKILL.md](../SKILL.md). Without it the dialog renders half-styled.

**A service wrapping a state resource is what lets a host's own menu take over the floating
button's job.** `appendConsentWidgetService(context, alias?)` registers a ref-counted presence
service (`@owlmeans/state`'s `appendStateResource` behind `@owlmeans/context`'s `createService`) —
call it once, from the app's own `context.ts`, the same as any other `append*` mixin:

```ts
import { appendConsentWidgetService } from '@owlmeans/web-panel/consent'

appendConsentWidgetService<C, T>(context)
```

Then call `useConsentMenuPresence()` from the host menu's own **always-mounted** shell component,
never from inside the row. A dropdown's content (Radix `DropdownMenuContent` and most headless
menu content primitives) mounts its children only while the menu is OPEN, so presence announced
from inside the row hid the floating button only while the dropdown happened to be open, and
showed it again the instant it closed. The row is also not a `DropdownMenuItem`: an item takes the
inner button's focus and closes the menu on the click before the button's own handler runs.

```tsx
import { PanelConsentMenuWidget, useConsentMenuPresence } from '@owlmeans/web-panel/consent'

const MyMenu: FC = () => {
  useConsentMenuPresence()   // declares the row reachable for as long as THIS component is mounted
  return <DropdownMenu>
    <DropdownMenuTrigger>…</DropdownMenuTrigger>
    <DropdownMenuContent>
      <div className="px-2 py-1.5"><PanelConsentMenuWidget /></div>   {/* a plain row, not an item */}
    </DropdownMenuContent>
  </DropdownMenu>
}
```

`PanelCookieConsent` reads the same service (`useConsentWidgetPresent()`, internally) and computes
`noReopenButton` from it whenever the caller has not passed one explicitly — an app that both
mounts `PanelCookieConsent` at its root and calls `useConsentMenuPresence()` from its collapsed
menu gets the floating button exactly while the menu is not, with no further wiring. Ref-counted
rather than a boolean latch, because more than one menu shell can be mounted for one commit during
a layout transition (a stale header still showing its own collapsed menu while a new screen's own
menu has already mounted) and because React 18 StrictMode double-invokes mount/cleanup in dev.

**The pair a consumer imports** — the dialog and the control that takes over its floating button:

| Job | Import from `@owlmeans/web-panel/consent` | Where it goes |
|---|---|---|
| The consent UI — bar, window, spinner (and its floating re-open button) | `PanelCookieConsent` | Beside the router — a `PanelApp` child — once |
| Asking only in consent countries | `cfg.cookieConsent.geo`, or `appendConsentGeoPlugin(context, plugin)` | The app's `config.ts` / `context.ts` |
| The "Cookie settings" control in a footer or menu | `PanelConsentMenuWidget` (`label`, `className`, `onSelect?` — defaults to `consentStore.open('reopen')`) | Inside the host's own footer/menu |
| Hiding the floating button while that control is reachable | `useConsentMenuPresence()` | Called by the always-mounted component that renders the control — mounted ONLY while the control can actually be reached: a component that is merely hidden by CSS (`xl:hidden`) is still mounted and still claims presence, so the floating button vanishes with nothing else to open the dialog; render it conditionally instead (viable's header mounts its hamburger menu only below the full-row breakpoint) |
| Registering the presence service | `appendConsentWidgetService(context)` | The app's `context.ts` |

A footer is the simplest host, because it is always mounted — the control and the presence call
live in one component:

```tsx
const CookieSettings: FC = () => {
  useConsentMenuPresence()
  return <PanelConsentMenuWidget label={t('footer.cookies')} className="w-auto text-muted-foreground" />
}
```

The widget renders a `<button data-consent-menu-widget>` styled as a menu row (`w-full`,
`text-popover-foreground`, `hover:bg-accent`); a footer passes `className` to restyle it (merged
through `cn`) and its own `label` — the packaged default reads "Cookie preferences".

**The presence service is optional, and nothing throws without it.** `PanelCookieConsent` checks
the context for `consentWidget` and, when `appendConsentWidgetService` never ran, renders the plain
bound dialog with its floating button; `useConsentMenuPresence()` then has nothing to claim and
does nothing. The presence read itself (`useConsentWidgetPresent`) still needs the service — its
state resource is registered by it — so any other caller checks first. A dialog that read an
unregistered state resource threw inside render ("Resource consent-widget-presence not found") and
blanked the whole application. Pinned by `tests/consent.spec.ts` (`?consent=bare` / `?consent=menu`;
the configuration by `?consentCfg=window|bar`, `?modeProp=` and `?consentGeo=<CC>|fail`).
