import { useCallback, useState } from 'react'
import type { CSSProperties, FC } from 'react'
import { useContext } from '@owlmeans/client'
import type { CommonConfig } from '@owlmeans/config'
import type { LoginContext, LoginMethod, LoginScreenProps, LoginService } from './types.js'
import { LOGIN_SERVICE } from './consts.js'
import { primaryLoginMethod } from './methods.js'
import { acceptTerms, resolveTerms, termsAccepted } from './terms.js'
import { resolveCredit } from './credit.js'

/**
 * The page the card sits in.
 *
 * It carries its own viewport height because this screen is rendered straight out of the
 * dispatcher, into whatever the application happens to have around it — which is usually nothing
 * with a height, so a percentage minimum would resolve to zero and leave the card at the top.
 */
const page: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100dvh', padding: '1rem',
  fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
}

// Centred throughout, so the plain screen and the styled one read the same way.
const box: CSSProperties = {
  width: '100%', maxWidth: '24rem', padding: '1.5rem', textAlign: 'center',
}

const button = (emphasis?: string): CSSProperties => ({
  display: 'block', width: '100%', marginTop: '.5rem', padding: '.625rem 1rem',
  fontSize: '1rem', cursor: 'pointer', borderRadius: '.375rem',
  border: '1px solid currentColor',
  ...(emphasis === 'primary' ? { fontWeight: 600 } : {}),
})

/**
 * The sign-in screen every application gets, whether or not it registered a styled one.
 *
 * It exists because a relying party must render SOMETHING rather than start a flow on its own, and
 * a relying party may not depend on a UI family. So this is deliberately plain: raw elements and
 * inline styles, no Tailwind class that a consumer's stylesheet would have to scan for, no shadcn
 * primitive a consumer would have to vendor. An application that registers a real screen through
 * `login().registerScreen(...)` never sees it.
 *
 * Because it is the floor rather than the design, it still has to be correct: it offers the same
 * methods, enforces the same terms confirmation, centres the same way, and renders the same
 * credit line.
 */
export const FallbackLoginScreen: FC<LoginScreenProps> = props => {
  const context = useContext() as unknown as LoginContext
  const t = props.translate ?? ((_key: string, defaultValue: string) => defaultValue)
  const cfg = props.config ?? (context.cfg as CommonConfig).security?.auth?.login
  const brand = (context.cfg as CommonConfig).brand

  const login = context.service<LoginService>(LOGIN_SERVICE)
  const env = login.env()
  const resolved = resolveTerms(props.terms ?? cfg?.terms)
  const credit = resolveCredit(cfg?.credit, brand, context.cfg.service)

  const [accepted, setAccepted] = useState(() => termsAccepted(resolved))
  const [attempted, setAttempted] = useState(false)

  const all = login.methods({ context, env })
  const methods = typeof props.methods === 'function'
    ? props.methods(all)
    : props.methods ?? all
  const primary = primaryLoginMethod(methods)

  const blocked = resolved != null && resolved.required && !accepted

  const select = useCallback((method: LoginMethod) => {
    if (blocked) {
      setAttempted(true)
      return
    }
    void method.start({ context, env })
  }, [blocked, context, env])

  const onAccept = useCallback((value: boolean) => {
    setAccepted(value)
    setAttempted(false)
    acceptTerms(resolved, value)
  }, [resolved])

  return <div data-login-screen style={page}><div style={box}>
    <h1 style={{ fontSize: '1.25rem', marginBottom: '.25rem' }}>
      {props.title ?? t('login.title', 'Sign in')}
    </h1>
    <p style={{ opacity: .75, marginTop: 0 }}>
      {props.subtitle ?? t('login.subtitle', 'Choose how you would like to continue.')}
    </p>

    {methods.length < 1
      ? <p role="status">{t('login.empty', 'No sign-in method is configured for this application.')}</p>
      : methods.map(method => <button
        key={method.id} type="button" data-login-method={method.id}
        // `aria-disabled`, never `disabled`: a disabled button swallows the click, so a user who
        // has not confirmed the terms would press it and be told nothing at all.
        aria-disabled={blocked} data-blocked={blocked ? 'true' : undefined}
        style={{ ...button(method.emphasis), opacity: blocked ? .6 : 1 }}
        autoFocus={method.id === primary?.id}
        onClick={() => select(method)}
      >
        {method.label ?? t(`login.method.${method.i18nKey ?? method.id}`, method.id)}
      </button>)}

    {resolved != null && <p style={{ marginTop: '1rem', fontSize: '.875rem' }}>
      <label>
        <input
          type="checkbox" checked={accepted} data-login-terms
          onChange={event => onAccept(event.target.checked)}
        />{' '}
        {t('login.terms.agreement', 'I have read and agree to the Terms & Conditions and the Privacy Policy.')}
      </label>
      {' '}
      <a href={resolved.terms} target="_blank" rel="noreferrer noopener">
        {t('login.terms.terms', 'Terms & Conditions')}
      </a>
      {' · '}
      <a href={resolved.privacy} target="_blank" rel="noreferrer noopener">
        {t('login.terms.privacy', 'Privacy Policy')}
      </a>
    </p>}

    {attempted && blocked && <p role="alert" style={{ color: '#b00', fontSize: '.875rem' }}>
      {t('login.terms.required',
        'Please confirm the Terms & Conditions and the Privacy Policy to continue.')}
    </p>}

    {props.footer ?? <p style={{ marginTop: '2rem', fontSize: '.75rem', opacity: .7 }}>
      {credit.poweredBy && <span>{t('login.credit.powered', 'Powered by OwlMeans')}</span>}
      {credit.poweredBy && credit.line != null && ' · '}
      {credit.line}
    </p>}
  </div></div>
}
