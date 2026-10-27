---
name: menu
description: ConsentMenuWidget, a plain row a host's own menu renders to reopen the dialog, and where its presence signal must come from.
metadata:
  purposes: consent, navigation
  mentions: ConsentMenuWidget, useConsentMenuPresence, consentStore.open
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-consent — A menu row

## A menu row for a host that already has one

`ConsentMenuWidget` renders one row — icon, translated label, `onClick` reopening the dialog
(`consentStore.open('reopen')` by default, or a caller's own `onSelect`) — for a host whose own
navigation already carries a settings menu and would rather offer cookie preferences there than as
a second floating button. It calls `consentStore.open` directly, never `useConsent()`, for the same
init-on-mount reason as everywhere else in this skill (*Reading the decision* in [SKILL.md](../SKILL.md)).

**It carries no presence signalling of its own.** A host that wants `CookieConsent`'s floating
button to hide while this row is reachable needs to know that itself, from something that stays
mounted for as long as the row is reachable — never from the row's own mount. A row placed inside a
host menu's lazily-rendered content (Radix's `DropdownMenuContent`, and most headless menu
primitives, only mount their children while the menu is actually OPEN) reports "present" for a
fraction of the time the menu itself is on screen, and the floating button reappears the instant
the menu closes. `@owlmeans/web-panel/consent`'s `useConsentMenuPresence()` is the fix for a
context-aware host: call it from the menu's own always-mounted shell component, not from inside the
row. A context-free host (an Astro island with its own menu) owns that judgement itself.
