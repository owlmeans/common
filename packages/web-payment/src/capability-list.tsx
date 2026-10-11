import type { CapabilityView } from '@owlmeans/payment'
import { PromoNote, useEntitlementCopy } from './copy.js'
import type { CapabilityListProps } from './types.js'

const classes = (...names: Array<string | false | null | undefined>): string =>
  names.filter(Boolean).join(' ')

/** One row per param, in view order: granted when any row grants it, the promo of that row. */
const collapse = (capabilities: CapabilityView[]): CapabilityView[] => {
  const rows = new Map<string, CapabilityView>()
  for (const capability of capabilities) {
    const seen = rows.get(capability.param)
    if (seen == null || (!seen.granted && capability.granted)) {
      rows.set(capability.param, capability)
    }
  }

  return [...rows.values()]
}

/**
 * The capabilities of a view, labelled by the application. A capability without a label is not
 * rendered, so a view may carry grants a screen has nothing to say about.
 */
export const CapabilityList = ({ capabilities, labels, onlyGranted = false, className }: CapabilityListProps) => {
  const copy = useEntitlementCopy()
  const rows = collapse(capabilities).filter(capability =>
    (labels[capability.param] ?? '') !== '' && (!onlyGranted || capability.granted))

  return <ul data-capability-list="" className={classes('grid gap-2 text-sm', className)}>
    {rows.map(capability => <li
      key={capability.param}
      data-capability={capability.param}
      data-granted={capability.granted ? 'true' : 'false'}
      className="flex items-start gap-2"
    >
      <span aria-hidden="true" className={classes(
        'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-xs font-semibold',
        capability.granted ? 'text-primary' : 'text-muted-foreground',
      )}>{capability.granted ? '✓' : '–'}</span>
      <span className="grid gap-0.5">
        <span className={capability.granted ? undefined : 'text-muted-foreground'}>
          {labels[capability.param]}
          <span className="sr-only">{` — ${copy.text(capability.granted ? 'capability.included' : 'capability.not-included')}`}</span>
        </span>
        {capability.promo != null && <span className="text-xs"><PromoNote promo={capability.promo} copy={copy} /></span>}
      </span>
    </li>)}
  </ul>
}
