import { useEffect, useRef, type FC } from 'react'
import type { SelectAllProps } from './types.js'

/**
 * One framed "Select all" box. The list shows it twice — once as its first element and once, in the
 * step, as its last, right above the buttons — so the choice is always at hand wherever the person
 * stands in a long list. Both speak for the same rows and read the same model, so they always agree.
 *
 * The two carry different hooks: `data-marketing-consent-all*` is the long-standing pair a test
 * helper (`makePageHelper(page).answerMarketingConsent`) clicks and must match exactly ONE element,
 * so the closing box has its own `data-marketing-consent-all-end*`.
 */
export const SelectAll: FC<SelectAllProps> = ({ t, model, placement, onTicked }) => {
  const ref = useRef<HTMLInputElement>(null)
  const requiredOnly = model.bulkSelection === 'required'
  const end = placement === 'end'

  useEffect(() => {
    if (ref.current != null) {
      ref.current.indeterminate = model.allIndeterminate
    }
  }, [model.allIndeterminate])

  const frame = { [end ? 'data-marketing-consent-all-end-frame' : 'data-marketing-consent-all-frame']: '' }
  const box = { [end ? 'data-marketing-consent-all-end' : 'data-marketing-consent-all']: true }

  return (
    <label
      {...frame}
      className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm font-medium cursor-pointer"
      // The frame reaches outward by its own border and padding, so the checkbox inside it stands
      // on the same vertical line as the checkbox of every row.
      style={{ marginInline: 'calc(-0.75rem - 1px)' }}
    >
      <input
        ref={ref}
        type="checkbox"
        {...box}
        className="size-4 shrink-0 accent-primary"
        checked={model.allChecked}
        onChange={event => {
          model.toggleAll(event.target.checked)
          if (event.target.checked) {
            onTicked?.()
          }
        }}
      />
      {requiredOnly ? t('screen.all-required', 'Select required agreements') : t('screen.all', 'Select all')}
    </label>
  )
}
