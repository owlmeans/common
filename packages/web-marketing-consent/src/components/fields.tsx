import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { UseMarketingConsentModel } from '../hooks/use-marketing-consent.js'
import { rowTextOf } from './inline.js'
import type { Translate } from './inline.js'
import { ConsentRow, RevisedLine } from './row.js'
import { ConsentTerms } from './terms.js'

export interface ConsentFieldsProps {
  t: Translate
  model: UseMarketingConsentModel
  /**
   * The sign-in screen's own translator (`auth` resource), which the Terms row speaks in. Given
   * only by the screen: the settings card has no Terms row and passes nothing.
   */
  termsT?: Translate
  locale?: string
}

/**
 * The select-all/list body shared by `MarketingConsentScreen` and `MarketingConsentPreferences` —
 * written once so the two never drift.
 *
 * Select-all is a framed box of its own and the first thing on screen; below it ONE list, in which
 * the Terms confirmation (when the screen owes one) is the first row, drawn like every consent row
 * and marked mandatory, followed by the consents in their catalogue order — no group headings, one
 * continuous list.
 *
 * `data-marketing-consent-item`/`data-marketing-consent-all` are the SAME testids in both hosts;
 * the two are never mounted on the same page at once. Checkboxes are bare
 * `<input type="checkbox">`, the same native-control choice `@owlmeans/client-auth`'s own
 * `LoginTerms` makes for a sign-in screen — no checkbox primitive (and its Radix peer) is vendored
 * just to render one.
 */
export const ConsentFields: FC<ConsentFieldsProps> = ({ t, model, termsT, locale }) => {
  const allRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (allRef.current != null) {
      allRef.current.indeterminate = model.allIndeterminate
    }
  }, [model.allIndeterminate])

  const showTerms = termsT != null && model.terms.needed
  const rows = model.groups.reduce((count, group) => count + group.items.length, 0) + (showTerms ? 1 : 0)
  const note = t('screen.required-note', '* Required')
  const marked = note.startsWith('*')

  return (
    <div className="flex flex-col gap-5" data-marketing-consent-fields="">
      {/* One row is nothing to select "all" of. */}
      {rows > 1 && (
        <label
          data-marketing-consent-all-frame=""
          className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm font-medium cursor-pointer"
          // The frame reaches outward by its own border and padding, so the checkbox inside it stands
          // on the same vertical line as the checkbox of every row below.
          style={{ marginInline: 'calc(-0.75rem - 1px)' }}
        >
          <input
            ref={allRef}
            type="checkbox"
            data-marketing-consent-all
            className="size-4 shrink-0 accent-primary"
            checked={model.allChecked}
            onChange={event => model.toggleAll(event.target.checked)}
          />
          {t('screen.all', 'Select all')}
        </label>
      )}

      <div className="flex flex-col gap-5">
        {showTerms && <ConsentTerms termsT={termsT} t={t} model={model.terms} locale={locale} />}

        {model.groups.flatMap(group => group.items).map(item => {
          const { statement, detail } = rowTextOf(item.definition, t, locale)

          return (
            <ConsentRow
              key={item.definition.key}
              checkbox={
                <input
                  type="checkbox"
                  data-marketing-consent-item={item.definition.key}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={item.granted}
                  onChange={event => model.toggle(item.definition.key, event.target.checked)}
                />
              }
              statement={<>
                {statement}
                {item.updated && (
                  <span
                    data-marketing-consent-updated={item.definition.key}
                    className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
                  >
                    {t('screen.updated', 'Updated')}
                  </span>
                )}
              </>}
              detail={detail}
              notes={<>
                {model.gpc && item.definition.honorGpc === true && (
                  <span className="text-xs text-muted-foreground">
                    {t('screen.gpc', "Honored via your browser's Global Privacy Control signal")}
                  </span>
                )}
                <RevisedLine
                  template={t('screen.last-updated', 'Last updated: {{date}}')}
                  date={item.definition.revisedAt}
                  datum={{ 'data-marketing-consent-revised': item.definition.key }}
                />
              </>}
            />
          )
        })}
      </div>

      {showTerms && (
        <p data-marketing-consent-required-note="" className="text-xs text-muted-foreground">
          {marked && <span className="text-destructive">*</span>}
          {marked ? note.slice(1) : note}
        </p>
      )}
    </div>
  )
}
