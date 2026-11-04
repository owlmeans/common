import type { FC } from 'react'
import { ConsentRow, RevisedLine } from './row.js'
import { SelectAll } from './select-all.js'
import { ConsentTerms } from './terms.js'
import { BAR_AIR, COOKIE_BAR, REDUCED_MOTION } from './consts.local.js'
import type { ConsentFieldsProps } from './types.js'
import { inlineHelper } from './inline.js'

/**
 * The select-all/list body shared by `MarketingConsentScreen` and `MarketingConsentPreferences` —
 * written once so the two never drift.
 *
 * Select-all is a framed box of its own and the first thing on screen; below it ONE list, in which
 * the Terms confirmation (when the screen owes one) is the first row, drawn like every consent row
 * and marked mandatory, followed by the consents in their catalogue order — no group headings, one
 * continuous list. In the step (`actions` given) the list closes with the same box again, right above
 * the buttons, and ticking the first one scrolls the buttons into view: after a long list a person
 * who has chosen "all" should not have to hunt for what to press next.
 *
 * `data-marketing-consent-item`/`data-marketing-consent-all` are the SAME testids in both hosts;
 * the two are never mounted on the same page at once. Checkboxes are bare
 * `<input type="checkbox">`, the same native-control choice `@owlmeans/client-auth`'s own
 * `LoginTerms` makes for a sign-in screen — no checkbox primitive (and its Radix peer) is vendored
 * just to render one.
 */
export const ConsentFields: FC<ConsentFieldsProps> = ({ t, model, termsT, locale, actions }) => {
  /**
   * Bring the buttons into view — the least scroll that does it, so a screen that already shows them
   * does not move — instantly for a person who asked their system for less motion, and clear of a
   * cookie bar floating over the bottom of the page. Focus stays where it is: moving it on a checkbox
   * change would be a surprise for a keyboard or screen-reader user.
   */
  const reveal = (): void => {
    const target = actions?.current
    if (target == null || typeof target.scrollIntoView !== 'function') {
      return
    }
    const still = typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION).matches === true
    // A cookie bar still floating over the bottom of the page (the person signed in without answering
    // it) must not end up on top of the buttons: leave its height free beneath them.
    const covered = document.querySelector(COOKIE_BAR)?.getBoundingClientRect().height ?? 0
    target.style.scrollMarginBottom = covered > 0 ? `${Math.ceil(covered) + BAR_AIR}px` : ''
    target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' })
  }

  const showTerms = termsT != null && model.terms.needed
  const rows = model.groups.reduce((count, group) => count + group.items.length, 0) + (showTerms ? 1 : 0)
  const requiredOnly = model.bulkSelection === 'required'
  const note = t('screen.required-note', '* Required')
  const marked = note.startsWith('*')
  // Required-only mode never offers a bulk optional-purpose choice, including in settings.
  const showAll = requiredOnly ? showTerms : rows > 1

  return (
    <div className="flex flex-col gap-5" data-marketing-consent-fields="">
      {showAll && <SelectAll t={t} model={model} placement="top" onTicked={actions != null ? reveal : undefined} />}

      <div className="flex flex-col gap-5">
        {showTerms && <ConsentTerms termsT={termsT} t={t} model={model.terms} locale={locale} />}

        {model.groups.flatMap(group => group.items).map(item => {
          const { statement, detail } = inlineHelper.rowTextOf(item.definition, t, locale)

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

      {actions != null && showAll && <SelectAll t={t} model={model} placement="end" />}
    </div>
  )
}
