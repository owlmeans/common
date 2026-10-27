import type { FC } from 'react'
import { cn } from '../../@/lib/utils.js'
import { pickerIconHelper } from '../../picker/icons.js'
import { pickerColorHelper } from '../../picker/vocabulary.js'
import { PICKER_FALLBACK_ICON } from '../../picker/vocabulary/consts.js'
import type { IconTileProps } from './types.js'
import { PICK_SCOPE, PLAIN, PLAIN_SIZE, TILE, TILE_SIZE } from './consts.local.js'

/**
 * A stored mark rendered — the way a list, a chip or a header shows what a person chose.
 *
 * `tile` puts the icon in the colour's ink on the colour's ground; `plain` is the ink alone. Both
 * follow the page's scheme on their own (`.dark`, or the system's dark unless `.light`). An unknown
 * icon renders the fallback circle and an unknown colour slate — a stored value never breaks a page.
 */
export const IconTile: FC<IconTileProps> = (
  { icon, color, colors, size = 'md', variant = 'tile', label, className, style }
) => {
  const Icon = pickerIconHelper.iconOf(icon)
  const resolved = pickerColorHelper.resolve(color, colors)

  return <span
    data-icon-tile={variant}
    data-icon={pickerIconHelper.has(icon) ? icon : PICKER_FALLBACK_ICON}
    data-color={resolved?.key}
    role={label != null ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label != null ? undefined : true}
    title={label}
    style={{ ...pickerColorHelper.styleOf(color, colors), ...style }}
    className={cn(PICK_SCOPE, variant === 'tile' ? TILE : PLAIN, variant === 'tile' ? TILE_SIZE[size] : PLAIN_SIZE[size], className)}
  >
    <Icon aria-hidden="true" />
  </span>
}
