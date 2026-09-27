import type { FC } from 'react'
import {
  CONSENT_COOKIE_DAYS, CONSENT_KEY, DEFAULT_CONSENT_CATEGORIES,
  defaultConsentTranslate, interpolate, openConsent,
} from '@owlmeans/consent'
import type { ConsentService } from '@owlmeans/consent'
import { cn, disclosedDomains } from '../lib/utils.js'
import type { CookiePolicyProps } from '../types.js'

type Translate = (key: string, defaultValue: string) => string

interface ServiceListProps {
  services: ConsentService[]
  /** The category's own label, already resolved — it names the list for assistive technology. */
  label: string
  /** The category key, for tests and CSS; absent for the trailing group of unmatched services. */
  category?: string
  t: Translate
}

/**
 * The services one category gates, as a nested list inside that category's item.
 *
 * A list and a description list rather than headings: the page's only heading is its `h1`, the
 * categories are list items, and a service heading below them would either skip a level or
 * promote a service above the category that governs it.
 */
const ServiceList: FC<ServiceListProps> = ({ services, label, category, t }) =>
  <ul
    aria-label={interpolate(t('policyServicesOf', 'Services — {{category}}'), { category: label })}
    data-cookie-policy-services={category ?? ''}
  >
    {services.map((service, index) => <li key={`${service.name}-${index}`} data-cookie-policy-service>
      <strong>{service.name}</strong>
      <dl>
        <div>
          <dt>{t('policyProvider', 'Provider')}</dt>
          <dd>{service.provider}</dd>
        </div>
        {service.purpose != null && service.purpose !== '' && <div>
          <dt>{t('policyPurpose', 'Purpose')}</dt>
          <dd>{service.purpose}</dd>
        </div>}
        {service.cookies != null && service.cookies.length > 0 && <div>
          <dt>{t('policyCookies', 'Cookies')}</dt>
          <dd>{service.cookies.map((cookie, at) => <span key={`${cookie}-${at}`}>
            {at > 0 && ', '}<code>{cookie}</code>
          </span>)}</dd>
        </div>}
      </dl>
      {service.privacyHref != null && service.privacyHref !== '' && <a
        href={service.privacyHref} target="_blank" rel="noopener noreferrer"
      >{interpolate(t('policyServicePrivacy', '{{provider}} privacy policy'),
        { provider: service.provider })}</a>}
    </li>)}
  </ul>

/**
 * A cookie policy that states only what this application can actually assert.
 *
 * Which categories are in force, what each one drives, where the choice is stored and for how
 * long — all of it read from the same configuration the dialog renders, so the page cannot claim
 * something the widget does not do. That is the whole reason it is generated rather than written:
 * a hand-written policy drifts from the code the first time a category changes, and nobody notices
 * because nobody reads it until it matters.
 *
 * Everything OwlMeans cannot assert on the operator's behalf — who the controller is, what the
 * lawful basis is, how to exercise rights — is deferred to their own privacy policy and terms.
 *
 * `services` names WHO receives data under each category. It is the one input the widget cannot
 * derive, so it comes from whatever added the tag (`googleTagServices(id)` for a Google tag), and
 * a service is never dropped for want of a matching category: one whose category is not in force
 * is listed in a trailing group, because a service the page runs and does not disclose is worse
 * than one disclosed in the wrong place.
 */
export const CookiePolicy: FC<CookiePolicyProps> = props => {
  const categories = props.categories ?? DEFAULT_CONSENT_CATEGORIES
  const t = props.translate ?? defaultConsentTranslate(props.locale)
  const storageKey = props.storageKey ?? CONSENT_KEY
  const days = props.cookieDays ?? CONSENT_COOKIE_DAYS
  const services = props.services ?? []
  const keys = new Set(categories.map(category => category.key))
  const other = services.filter(service => !keys.has(service.category))
  const otherLabel = t('policyOtherServices', 'Other services')
  const domains = disclosedDomains(props.linker)

  return <article className={cn('prose prose-sm max-w-2xl', props.className)} data-cookie-policy>
    <h1>{t('policyTitle', 'Cookie Policy')}</h1>
    <p>{t('policyIntro', 'This page describes the cookies and similar storage this application uses, and how you can control them.')}</p>

    <ul>
      {categories.map(category => {
        const label = t(category.labelKey, category.key)
        const gated = services.filter(service => service.category === category.key)

        return <li key={category.key} data-cookie-policy-category={category.key}>
          <strong>{label}</strong>
          {category.required === true && <> — {t('required', 'Required')}</>}
          <br />
          {t(category.descriptionKey, '')}
          {gated.length > 0 && <ServiceList services={gated} label={label} category={category.key} t={t} />}
        </li>
      })}
      {other.length > 0 && <li key=" other" data-cookie-policy-other>
        <strong>{otherLabel}</strong>
        <br />
        {t('policyOtherServicesDesc', 'Services this application runs outside the categories above.')}
        <ServiceList services={other} label={otherLabel} t={t} />
      </li>}
    </ul>

    <p>{interpolate(
      t('policyStorage', 'Your choice is stored in this browser under "{{key}}", both in local storage and as a cookie.'),
      { key: storageKey }
    )}</p>

    {domains.length > 1 && <>
      <p>{t('policyDomains', 'This choice applies across these domains:')}</p>
      <ul data-cookie-policy-domains>
        {domains.map(domain => <li key={domain}>{domain}</li>)}
      </ul>
    </>}

    <p>{interpolate(
      t('policyRetention', 'The record is kept for {{days}} days, after which you will be asked again.'),
      { days }
    )}</p>

    {props.operator != null && props.operator !== '' && <p>
      {interpolate(t('policyOperator', 'This application is operated by {{operator}}.'),
        { operator: props.operator })}
      {' '}
      {t('policyContact', 'See their privacy policy and terms for how they handle your data.')}
    </p>}

    <p>
      {props.privacyHref != null && props.privacyHref !== '' && <a
        href={props.privacyHref} target="_blank" rel="noopener noreferrer"
      >{t('privacy', 'Privacy Policy')}</a>}
      {props.privacyHref != null && props.termsHref != null && ' · '}
      {props.termsHref != null && props.termsHref !== '' && <a
        href={props.termsHref} target="_blank" rel="noopener noreferrer"
      >{t('terms', 'Terms & Conditions')}</a>}
    </p>

    <p>
      <button
        type="button" onClick={() => openConsent('reopen')} data-cookie-policy-manage
        className="not-prose inline-flex min-h-11 items-center justify-center rounded-full border-[1.5px] border-foreground bg-transparent px-6 py-2.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
      >
        {t('manage', 'Manage preferences')}
      </button>
    </p>
  </article>
}
