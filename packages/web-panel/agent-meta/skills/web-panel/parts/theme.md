---
name: theme
description: The light/dark switch — ThemeToggle, useColorScheme, the two-class html contract and the CSS a theme must read, and the head bootstrap script from ./scheme.
metadata:
  purposes: theme
  mentions: ThemeToggle, useColorScheme, colorSchemeHelper, colorSchemeBootstrapScript, applyColorScheme, COLOR_SCHEME_KEY, COLOR_SCHEME_EVENT, ColorSchemeChoice, themeToggle, @owlmeans/web-panel/scheme
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel — Light and dark

| Export | Description |
|--------|-------------|
| `ThemeToggle` / `useColorScheme` | The light/dark switcher (`ThemeToggleProps`, `ThemeToggleLabels`) and the hook behind it (`ColorSchemeModel`) |

## Subpath `./scheme`

- `./scheme` — the React-free colour-scheme half: `COLOR_SCHEME_KEY`, `COLOR_SCHEME_EVENT`,
  `ColorSchemeChoice`, `colorSchemeHelper` (`readColorScheme`, `applyColorScheme`, `colorSchemeBootstrapScript`) — safe
  to import from a Node build script

## Light and dark — `ThemeToggle`, `useColorScheme`, `./scheme`

The standard switcher, with no theme library behind it. `NavLayout themeToggle` (or `Footer
themeToggle`) puts it in the footer's bottom row beside the credit, whatever `footer` is; absent or
`false`, the footer's DOM is what it is without one. It is also mountable on its own.

**The contract is two classes on `<html>`.** `dark` = the visitor chose dark, `light` = chose light,
neither = follow the operating system. The choice is stored under `COLOR_SCHEME_KEY`
(`owlmeans:color-scheme`, `localStorage`, every access in `try`). `light` exists as a class of its
own because a visitor choosing light on a dark system has no other way to say so to a stylesheet
that paints dark under `prefers-color-scheme: dark`. So a consumer's CSS must read BOTH:

```css
:root { color-scheme: light; /* light tokens */ }
.dark { color-scheme: dark; /* dark tokens */ }
@media (prefers-color-scheme: dark) {
  :root:not(.light) { color-scheme: dark; /* the same dark tokens */ }
}
/* Tailwind v4: a `dark:` variant that follows the same rule */
@custom-variant dark {
  &:where(.dark, .dark *) { @slot; }
  @media (prefers-color-scheme: dark) { &:where(:root:not(.light), :root:not(.light) *) { @slot; } }
}
```

A theme with dark tokens under `.dark` alone never follows the OS; one with them under the media
query alone ignores an explicit light choice.

**The head bootstrap goes before any stylesheet paints.** `colorSchemeHelper.colorSchemeBootstrapScript()` returns a
self-contained inline script that puts the stored choice's class on `<html>` before first paint —
the only moment it can; a component doing it after mount shows a visitor who chose dark one frame
of the light page. A build step inlines it into `index.html` (import it from
`@owlmeans/web-panel/scheme` — that module imports nothing, React included) and a CSP that hashes
inline scripts must hash it. Without the bootstrap, `useColorScheme` re-applies the stored class on
mount: correct, one frame late.

Rules the pieces own:

- **The toggle flips the RESOLVED scheme** (`choice ?? system`), never the stored choice alone: on
  a dark system with nothing stored the first press means light. The icon is the scheme the page
  is in (sun while light, moon while dark), chosen in script, not by a `dark:` variant.
- **The accessible name says what pressing does** — `labels.toLight` / `labels.toDark`, English
  defaults; `NavLayout` resolves them through `translate` (`shell.toLight`, `shell.toDark`).
- **One choice per document.** `colorSchemeHelper.applyColorScheme(choice | null)` sets the class, stores or clears
  the key and dispatches `COLOR_SCHEME_EVENT`, so every mounted `useColorScheme` agrees at once;
  another tab's change arrives through `storage`, and an OS switch through `matchMedia` while
  nothing is stored. `setChoice(null)` hands the page back to the OS.
- **Look:** a 44px round target, `text-muted-foreground` → `hover:text-foreground`, the 3px
  `--ring` focus ring, no fill, border, gradient or shadow.

Pinned by `tests/scheme.spec.ts` (`?themeToggle=1`): the module's imports, the bootstrap string,
the class flip and persistence, the resolved flip under an emulated dark system, a node footer,
and the absent case.
