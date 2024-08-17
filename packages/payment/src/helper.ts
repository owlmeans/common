import { L10N_RECORD_PREFIX } from './consts.js'
import type { Localization } from './types.js'

export const l10nToId = (l10n: Localization, prefix?: boolean): string => 
  `${prefix ? L10N_RECORD_PREFIX + ':' : ''}${l10n.type}:${l10n.sku}:${l10n.lng}`
