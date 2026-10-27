import type { FC } from 'react'
import type { ColorPickerProps } from './types.js'
import { PickerRoot } from './root.js'

/**
 * The colour half alone: a trigger opening the swatches (plus a colour wheel and a hex field with
 * `customColors`). A swatch commits its key and closes; the wheel and the field commit as they
 * change and keep it open. Pass `colors` for an application palette — a status palette, say.
 */
export const ColorPicker: FC<ColorPickerProps> = (
  { value, onChange, trigger = 'button', customColors = false, ...base }
) => <PickerRoot
  {...base} mode="color" trigger={trigger} customColors={customColors} closeOnPick color={value}
  onColor={onChange} onIcon={() => undefined}
/>
