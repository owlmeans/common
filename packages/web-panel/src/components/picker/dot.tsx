import type { FC } from 'react'
import { cn } from '../../@/lib/utils.js'
import { pickerColorHelper } from '../../picker/vocabulary.js'
import type { ColorDotProps } from './types.js'
import { DOT, DOT_SIZE, PICK_SCOPE } from './consts.local.js'

/**
 * A stored colour as a dot, in the colour's ink — the ink keeps 3:1 on the page in both schemes,
 * which a dot (a graphic) needs; the brighter swatch does not. Unknown → slate.
 */
export const ColorDot: FC<ColorDotProps> = ({ color, colors, size = 'sm', label, className }) =>
  <span
    data-color-dot
    data-color={pickerColorHelper.resolve(color, colors)?.key}
    role={label != null ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label != null ? undefined : true}
    title={label}
    style={pickerColorHelper.styleOf(color, colors)}
    className={cn(PICK_SCOPE, DOT, DOT_SIZE[size], className)}
  />
