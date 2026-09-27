import type { FC, ReactNode } from 'react'
import type { Translate } from './inline.js'

export interface ConsentRowProps {
  /** The native checkbox. */
  checkbox: ReactNode
  /** What the person agrees to. */
  statement: ReactNode
  detail?: ReactNode
  /** Muted lines under the detail — a note, the last-updated date. */
  notes?: ReactNode
}

/**
 * One row of the consent list: a checkbox and its words. The Terms confirmation and every consent
 * are drawn by this one component, so the mandatory row is one of the list rather than a box of its
 * own.
 *
 * No width is set anywhere here: the host's frame decides how long a line may be, and `min-w-0`
 * plus `break-words` are what let a long statement wrap inside it instead of pushing the row out.
 */
export const ConsentRow: FC<ConsentRowProps> = ({ checkbox, statement, detail, notes }) => (
  <label className="flex items-start gap-3 text-sm cursor-pointer">
    {checkbox}
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="break-words">{statement}</span>
      {detail != null && (
        <span className="break-words text-xs leading-relaxed text-muted-foreground">{detail}</span>
      )}
      {notes}
    </span>
  </label>
)

/** The danger asterisk of a mandatory row, with its spoken equivalent. */
export const RequiredMark: FC<{ t: Translate }> = ({ t }) => (
  <>
    {' '}
    <span aria-hidden="true" className="text-destructive" data-marketing-consent-required="">*</span>
    <span className="sr-only">{t('screen.required', 'required')}</span>
  </>
)

/** "Last updated: <date>", the same line under every row. `datum` names it for tests. */
export const RevisedLine: FC<{ template: string, date: string, datum: Record<string, string> }> = (
  { template, date, datum },
) => (
  <span {...datum} className="text-xs text-muted-foreground">
    {template.split('{{date}}').join(date)}
  </span>
)
