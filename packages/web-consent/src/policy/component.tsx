import type { FC } from 'react'
import {
  CONSENT_COOKIE_DAYS, CONSENT_KEY, DEFAULT_CONSENT_CATEGORIES,
  defaultConsentTranslate, interpolate, openConsent,
} from '@owlmeans/consent'
import { cn } from '../lib/utils.js'
import type { CookiePolicyProps } from '../types.js'

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
 */
export const CookiePolicy: FC<CookiePolicyProps> = props => {
  const categories = props.categories ?? DEFAULT_CONSENT_CATEGORIES
  const t = props.translate ?? defaultConsentTranslate(props.locale)
  const storageKey = props.storageKey ?? CONSENT_KEY
  const days = props.cookieDays ?? CONSENT_COOKIE_DAYS

  return <article className={cn('prose prose-sm max-w-2xl', props.className)} data-cookie-policy>
    <h1>{t('policyTitle', 'Cookie Policy')}</h1>
    <p>{t('policyIntro', 'This page describes the cookies and similar storage this application uses, and how you can control them.')}</p>

    <ul>
      {categories.map(category => <li key={category.key}>
        <strong>{t(category.labelKey, category.key)}</strong>
        {category.required === true && <> — {t('required', 'Required')}</>}
        <br />
        {t(category.descriptionKey, '')}
      </li>)}
    </ul>

    <p>{interpolate(
      t('policyStorage', 'Your choice is stored in this browser under "{{key}}", both in local storage and as a cookie.'),
      { key: storageKey }
    )}</p>
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
      <button type="button" onClick={() => openConsent('reopen')} data-cookie-policy-manage>
        {t('manage', 'Manage preferences')}
      </button>
    </p>
  </article>
}
