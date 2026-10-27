import { useMemo } from 'react'
import type { FC } from 'react'
import { cn } from '../../@/lib/utils.js'
import { pickerColorHelper } from '../../picker/vocabulary.js'
import { PICKER_COLORS } from '../../picker/vocabulary/consts.js'
import type { ColorSwatchesProps } from './types.js'
import type { SwatchGridProps } from './types.local.js'
import { CustomColor } from './swatches/custom.js'
import { useRovingGrid } from './roving.js'
import { makePickerText } from './text.js'
import { PICK_SCOPE, SWATCH, SWATCH_DISC, SWATCH_SELECTED, SWATCHES } from './consts.local.js'

/**
 * The swatch grid every picker shares, laid out for its surface: twelve to a row in a popover,
 * as many 44px cells as fit in a sheet or below 768px. One tab stop; the arrows move in two
 * dimensions. A swatch is a `<button type="button">` named by its colour and pressed while chosen.
 */
export const SwatchGrid: FC<SwatchGridProps> = (
  { value, onChange, onCustomChange, colors, customColors, text, layout, label, className }
) => {
  const resolved = pickerColorHelper.resolve(value, colors)
  const selected = resolved == null || resolved.custom ? -1 : colors.findIndex(color => color.key === resolved.key)
  const roving = useRovingGrid({ count: colors.length, selected })

  return <div className={className}>
    <div
      ref={roving.ref} role="group" aria-label={label} onKeyDown={roving.onKeyDown}
      data-picker-swatches className={SWATCHES[layout]}
    >
      {colors.map((color, index) => {
        const named = pickerColorHelper.resolve(color.key, colors)
        const name = named != null ? text.color(named) : color.key
        const chosen = index === selected

        return <button
          key={color.key} type="button" data-roving-item data-picker-color={color.key}
          aria-label={name} aria-pressed={chosen} title={name}
          tabIndex={roving.tabIndexOf(index)} onFocus={() => roving.setCurrent(index)}
          onClick={() => onChange(color.key)}
          style={pickerColorHelper.styleOf(color.key, colors)}
          className={cn(PICK_SCOPE, SWATCH)}
        >
          <span aria-hidden="true" className={cn(SWATCH_DISC, chosen && SWATCH_SELECTED)} />
        </button>
      })}
    </div>
    {customColors && <CustomColor
      value={resolved?.custom === true ? resolved : null} onChange={onCustomChange ?? onChange} text={text}
    />}
  </div>
}

/**
 * The colour swatches inline — for a dialog or sheet the application already owns. Commits on
 * click; `customColors` adds the colour wheel and hex field. Strings through `translate` (English
 * without it — never an implicit i18n read).
 */
export const ColorSwatches: FC<ColorSwatchesProps> = (
  { value, onChange, colors = PICKER_COLORS, customColors = false, translate, label, className }
) => {
  const text = useMemo(() => makePickerText(translate), [translate])

  return <SwatchGrid
    value={value} onChange={onChange} colors={colors} customColors={customColors} text={text} layout="inline"
    label={label ?? text.text('color', 'Colour')} className={className}
  />
}
