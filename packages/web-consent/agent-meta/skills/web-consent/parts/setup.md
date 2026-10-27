---
name: setup
description: The Tailwind @source line pointing at src, and the packaged i18n bundle with the translate fall-through.
metadata:
  purposes: consent, config
  mentions: defaultConsentTranslate, consentI18nHelper, CONSENT_LOCALES, web-consent/src, @source
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-consent — Tailwind and i18n setup

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
`locale` — every language in `CONSENT_LOCALES` (the framework's seven plus French). The bundle
lives in `@owlmeans/consent` (`src/i18n/<locale>.json`); a new key goes into every one of them,
and that package's tests fail on a missing key or a dropped `{{placeholder}}` in any locale.
This package's `tests/bundle.spec.ts` reads every `t('…')` literal from the components, so a new
string without an English bundle entry fails there. A JSON-only edit is not re-emitted by an
incremental `tsc -b` — rebuild `@owlmeans/consent` with `tsc -b --force`, or consumers keep the old
bundle from `build/i18n`. **Once a `translate` prop is given,
the packaged bundle is not consulted at all**, so a wrapper that forwards a framework resolver alone
renders the English default for every key the application has not overridden, in every language. The
resolver must fall through to `consentI18nHelper.defaultConsentTranslate(locale)` for the default — which is exactly
what `@owlmeans/web-panel/consent` does, and why an app inside the panel family mounts
`PanelCookieConsent` / `PanelCookiePolicy` rather than these components directly.

`ConsentToggle` is exported for a host that builds its own dialog body; the wording it shows is the
caller's, already resolved.
