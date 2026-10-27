---
name: picker
description: The ./picker subpath — the standard icon and colour picker parts, their values, surfaces and strings, rendering a stored mark, DOM hooks and consumer setup.
metadata:
  purposes: picker, form
  mentions: IconColorPicker, ColorPicker, IconPicker, ColorSwatches, IconGrid, IconTile, ColorDot, usePickerTranslate, pickerColorHelper, pickerIconHelper, PICKER_COLORS, PICKER_COLOR_KEYS, PICKER_ICON_NAMES, @owlmeans/web-panel/picker
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel — Icon and colour picker

## Subpath: `./picker`

**Subpath exports**

- `./picker` — the standard icon + colour picker and its parts (`IconColorPicker`, `ColorPicker`,
  `IconPicker`, `ColorSwatches`, `IconGrid`, `IconTile`, `ColorDot`, `usePickerTranslate`), the icon
  components (`PICKER_ICONS`, `pickerIconHelper`) and everything of `./picker/vocabulary` — see
  below. Not re-exported by the root, so only a bundle importing it carries
  the icon catalogue
- `./picker/vocabulary` — the React-free half: the 24-colour palette (`PICKER_COLORS`,
  `PICKER_COLOR_KEYS`), the icon catalogue's names, categories and search words
  (`PICKER_ICON_ENTRIES`, `PICKER_ICON_NAMES`, `PICKER_ICON_CATEGORIES`), the fallbacks and
  `pickerColorHelper` — safe on a server, in a seed or a Node build script

The standard editor and renderer of an icon and a colour **a person chooses** — a workcard type's
or a status flow's mark, a label, a category. One component family, so every application offers
the same 24 colours, the same curated icons and the same behaviour on a desktop and a phone.

```ts
import {
  IconColorPicker, ColorPicker, IconPicker, ColorSwatches, IconGrid, IconTile, ColorDot, usePickerTranslate,
  pickerColorHelper, pickerIconHelper, PICKER_COLORS, PICKER_COLOR_KEYS,
} from '@owlmeans/web-panel/picker'
// Server, seed, build script — the data and the colour helper without React or icons:
// import { pickerColorHelper, PICKER_COLOR_KEYS } from '@owlmeans/web-panel/picker/vocabulary'
```

### Which part

| Part | When |
|---|---|
| `IconColorPicker` | Both halves of a mark. One trigger (the tile, "Rocket · Indigo", a chevron — or `trigger="tile"` for the tile alone) opens swatches above a searchable, categorized icon grid tinted in the chosen colour. Stays open for the other half; Esc, a click outside or (sheet) Done closes it |
| `ColorPicker` | A colour alone (`trigger="button"` or `"dot"`). Closes on a swatch. `colors` takes an application palette — e.g. status tones |
| `IconPicker` | An icon alone, tinted in `color`. Closes on a pick |
| `ColorSwatches`, `IconGrid` | Inline, for a dialog or sheet the application already owns — no trigger, no surface of their own |
| `IconTile` | A stored mark shown: the icon in the colour's ink on its ground (`variant="tile"`), or the ink alone (`"plain"`); `size` `xs`/`sm`/`md`/`lg`; `label` makes it an image, else decorative |
| `ColorDot` | A stored colour as a dot in its ink (`size` `xs`/`sm`/`md`) |
| `usePickerTranslate()` | The `translate` for an app rendered by `PanelApp` / `render()` — the packaged bundle in the current language |

### Values

- **Colour**: a palette key — `red orange amber yellow lime green emerald teal cyan sky blue indigo
  violet purple fuchsia pink rose maroon brown olive navy slate stone graphite` (`PICKER_COLOR_KEYS`,
  hue order) — or, only with `customColors`, a lowercase `#rrggbb`. Never a label ("Indigo").
- **Icon**: a kebab-case lucide name from the catalogue (`PICKER_ICON_NAMES`, ~250 in ten categories,
  a superset of the planning kits' icons). Never a component, never a label.
- `IconColorPicker` emits `onChange({ icon, color })` — both halves as they now stand; a half
  never chosen stays `undefined`, never `null`. `value` tolerates `null`s and absent halves.
- An unknown stored value renders the fallback (`slate`, `circle`) and never throws, so a value
  from an older palette or a typo never breaks a page.
- `customColors` (default `false`) adds a colour wheel (react-colorful) and a hex field: a full
  `#rrggbb` commits while typing, `#rgb` / `abc` on Enter or blur, always normalized to lowercase six
  digits; anything else marks the field `aria-invalid` and changes nothing. A custom colour's ink
  and grounds are derived to keep 4.5:1 in both modes.

### Surfaces

`surface="auto"` (default) opens a popover from 768px up and a bottom sheet below — decided when
it OPENS, kept until it closes. `surface="popover" | "sheet"` forces one. The popover is modal, so
inside an application's own Dialog or Sheet the wheel scrolls it and focus stays in it; it keeps
12px off the edges and scrolls inside rather than growing past the viewport. The sheet has a grab
handle, a sticky header with the preview and a 44px Done button, `88dvh` at most and safe-area
padding. Below 768px and on coarse pointers every cell, chip, field and button is at least 44px;
the search field takes focus on open only for a fine pointer (no keyboard pops up on a phone).
Keyboard: arrows move in two dimensions through swatches and icons (one tab stop each), Home/End,
ArrowDown from the search into the grid and ArrowUp back, Enter/Space picks, Esc closes and focus
returns to the trigger. Every control is a `<button type="button">` with an `aria-label`, so a
pick never submits an enclosing form.

### Strings

The parts never read i18n implicitly — rendered without an i18n instance they show English. Pass
`translate={usePickerTranslate()}` in an app rendered by `PanelApp` / `render()`: chrome, colour
names and category names come from the lib-tier `picker` bundle in eight languages (en, pl, ru, be,
uk, es, de, fr); icon names stay English. An app overrides a string at the App tier in the `lib`
namespace (`i18nHelper.addI18nApp('de', 'picker', { colors: { teal: 'Türkis' } }, { ns: LIB_NAMESPACE })`).
Keys: `label`, `icon`, `color`, `placeholder.{both,icon,color}`, `nothing`, `done`, `search`,
`searchPlaceholder`, `categoriesLabel`, `all`, `results` (`{count}`), `empty` (`{query}`), `clear`,
`custom`, `hex`, `invalidHex`, `colors.<key>`, `categories.<category>`. `label` and `placeholder`
props override per instance. Only the 24 palette names translate: an application palette passed as
`colors` shows its `label`s as given, so translate them before passing them in.

### RIGHT and WRONG

```tsx
import type { IconColorChange } from '@owlmeans/web-panel/picker'

// RIGHT — local state
const translate = usePickerTranslate()
const [mark, setMark] = useState<IconColorChange>({ icon: type.icon, color: type.tone })
<IconColorPicker label="Mark" value={mark} onChange={setMark} translate={translate} />

// RIGHT — react-hook-form: the field holds { icon, color }; the picker is the whole control
<Controller
  name="mark" control={form.control}
  render={({ field }) => <IconColorPicker
    id="mark" label="Mark" value={field.value} onChange={field.onChange} disabled={field.disabled} translate={translate}
  />}
/>
// …and on save: { tone: values.mark.color, icon: values.mark.icon }

// WRONG — a Select of colour names, a hand-made swatch row, or a label stored instead of the key
<Select value={tone} onValueChange={setTone}>{PICKER_COLOR_KEYS.map(k => <SelectItem value={k}>{k}</SelectItem>)}</Select>
{['red', 'blue'].map(c => <button className={`bg-${c}-500`} onClick={() => setTone(c)} />)}
onChange={next => save({ tone: 'Indigo' })}
// WRONG — the picker hands over a value, not an event
<ColorPicker value={field.value} onChange={event => field.onChange(event.target.value)} />
```

### Rendering a stored mark

```tsx
<IconTile icon={type.icon} color={type.tone} size="sm" />                 // list row, chip, header
<IconTile icon={flow.icon} color={flow.tone} variant="plain" />           // the ink alone, inline with text
<ColorDot color={label.color} />                                          // a dot
<span style={pickerColorHelper.styleOf(card.color)} className="text-(--pick-ink)">…</span>   // custom markup
```

`pickerColorHelper.styleOf(value, colors?)` returns the custom properties `--pick-swatch`,
`--pick-ink`, `--pick-soft`, `--pick-ink-dark`, `--pick-soft-dark` (a plain string record — it goes
straight into `style`). The parts switch to the dark values themselves, through explicit
arbitrary variants on web-panel's scheme contract (`.dark` on `<html>`, or the system's dark
unless `.light`) — never through the app's `dark:` variant. A hand-written element using
`styleOf` reads `--pick-ink` / `--pick-ink-dark` itself. `pickerColorHelper.resolve(value)` gives
every field (and `custom: true` for a hex); `hashKey(seed)` gives a stable palette key for a record
that has none. Code-chosen tones (a status's meaning) stay the app's own classes; a colour a PERSON
chose always renders through these parts.

**DOM hooks** (stable, used by end-to-end suites): the trigger `data-picker-trigger`, the open
surface `data-picker-surface="popover|sheet"`, a swatch `data-picker-color="<key>"` (the custom
row `"custom"`, `data-selected` while a custom value is chosen), an icon cell
`data-picker-icon="<name>"`, a chip `data-picker-category`, the search field `data-picker-search`,
the hex field `data-picker-hex`, the sheet's Done `data-picker-done`; `IconTile` carries
`data-icon-tile`, `data-icon`, `data-color`, `ColorDot` `data-color-dot`. Picker parts never carry
`data-tone` or `data-slot="button"` — an application's own rules on those never reach them.

### Consumer setup

- `@radix-ui/react-popover` is a peer, like the other Radix primitives: keep it on the SAME Radix
  generation as `@radix-ui/react-dialog` (update them together). The two share the dismissable-layer
  and focus-scope stacks; a popover from another generation inside a Dialog is treated as an outside
  click and loses focus to the dialog. `react-colorful` is a dependency of this package.
- The `@source` line for this package's `src` (see *Consumer setup — package boundary and Tailwind* in [SKILL.md](../SKILL.md)) is what brings the
  picker's classes — including its `[.dark_&]:` and `pointer-coarse:` variants — into the stylesheet.
- Tokens read: `--popover`, `--popover-foreground`, `--border`, `--input`, `--ring`, `--accent`,
  `--accent-foreground`, `--primary`, `--primary-foreground`, `--muted-foreground`, `--foreground`,
  `--destructive`.

Pinned by `tests/picker.spec.ts` (harness `/picker`: `?custom=1`, `?inSheet=1`, `?bare=1`,
`?surface=…`, `?compact=1`, `?empty=1`, `?inline=1`, `?dark=1`) and
`tests/picker-vocabulary.spec.ts` (palette contrast and OKLab distance, hex handling, catalogue ↔
components). `PICKER_SHOTS_DIR=<dir> bun test tests/picker-shots.spec.ts` writes every scenario's
screenshot at 1280 and 375, light and dark.
