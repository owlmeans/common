import { useRef, type FC } from 'react'
import { Cookie } from 'lucide-react'
import { consentI18nHelper } from '@owlmeans/consent'
import { webConsentUtils } from '../lib/utils.js'
import { useBarClearance } from './clearance.js'
import { ACCENT, BAR_PILL, OUTLINED } from './consts.local.js'
import { ConsentLinks } from './links.js'
import type { ConsentBarProps } from './types.local.js'

/**
 * The first question a visitor is asked, as a bar floating across the bottom of the page.
 *
 * It does NOT block the page: there is no overlay, no focus trap and no `aria-modal`, so the visitor
 * may read, scroll and press anything and leave the question unanswered — the bar simply stays, and
 * the body is padded by its height meanwhile (`useBarClearance`) so the end of a short page can be
 * scrolled out from under it. The
 * text says, in two short sentences, that essential cookies run the site and that the optional
 * categories in force (a list after a colon, so no language has to decline a label) are used only
 * with consent, which can be changed or withdrawn at any time — then the policy and the host's other
 * links. The preferences window is the modal surface: the bar's own "Cookie preferences", and the
 * sign-in gate (`reason: 'login'`), replace the bar with it.
 *
 * Three answers: "Cookie preferences" replaces the bar with the preferences window, "Accept only
 * mandatory" refuses every optional category, "Accept all" grants them. The two answers carry the
 * same accent — refusing is exactly as prominent as accepting, and exactly one click away. With no
 * optional category at all there is nothing to refuse, so "Accept only mandatory" is not offered.
 *
 * `[data-consent-dialog]` and `[data-consent-accept-all]` are here as on the window — one surface is
 * open at a time, so a test or a host keys on them without knowing the mode; `[data-consent-bar]`
 * tells the two apart.
 */
export const ConsentBar: FC<ConsentBarProps> = props => {
  const { t, categories, domains } = props
  const surface = useRef<HTMLDivElement>(null)
  useBarClearance(surface)

  const optional = categories.filter(category => category.required !== true)
  const description = optional.length > 0
    ? consentI18nHelper.interpolate(
      t('barDescription', 'We use essential cookies to run this site, and optional ones only with your consent: {{categories}}. You can change or withdraw it at any time.'),
      { categories: optional.map(category => t(category.labelKey, category.key)).join(', ') }
    )
    : t('barDescriptionEssential', 'This site uses only essential cookies, which need no consent.')

  return <div
    ref={surface}
    className={webConsentUtils.cn(
      'fixed inset-x-0 bottom-0 z-[999999] max-h-[60vh] overflow-y-auto border-t border-border bg-background text-foreground',
      props.barClassName
    )}
    role="dialog" aria-labelledby="cc-bar-title"
    aria-describedby={domains.length > 1 ? 'cc-bar-desc cc-bar-domains' : 'cc-bar-desc'}
    data-consent-dialog data-consent-bar data-consent-mode="bar"
  >
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:gap-10">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-primary">
            <Cookie className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="cc-bar-title" className="text-balance text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
            {t('barTitle', 'Cookies on this site')}
          </h2>
        </div>

        <p id="cc-bar-desc" className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        {domains.length > 1 && <p
          id="cc-bar-domains" data-consent-domains
          className="mt-2 text-pretty text-xs text-muted-foreground"
        >
          {consentI18nHelper.interpolate(t('domains', 'This choice applies to {{domains}}.'), { domains: domains.join(', ') })}
        </p>}

        <ConsentLinks t={t} policyHref={props.policyHref} links={props.links} className="mt-1" />
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end lg:w-auto lg:max-w-xl lg:flex-shrink-0">
        <button
          type="button" onClick={props.onPreferences} data-consent-preferences
          className={webConsentUtils.cn(BAR_PILL, OUTLINED)}
        >{t('openPreferences', 'Cookie preferences')}</button>
        {optional.length > 0 && <button
          type="button" onClick={props.onMandatory} data-consent-mandatory
          className={webConsentUtils.cn(BAR_PILL, ACCENT)}
        >{t('acceptMandatory', 'Accept only mandatory')}</button>}
        <button
          type="button" onClick={props.onAcceptAll} data-consent-accept-all
          className={webConsentUtils.cn(BAR_PILL, ACCENT)}
        >{t('acceptAll', 'Accept All')}</button>
      </div>
    </div>
  </div>
}
