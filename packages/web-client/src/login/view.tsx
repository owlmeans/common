import type { FC } from 'react'
import { LoginIntent } from '@owlmeans/client-auth/login'
import { action, box, COPY, LOGOUT_COPY } from './consts.local.js'
import type { SurrogateViewProps } from './types.js'

export const LoginSurrogateView: FC<SurrogateViewProps> = (
  { stage, intent, onAction, error, translate }
) => {
  const t = translate ?? ((_key: string, defaultValue: string) => defaultValue)
  const scope = intent === LoginIntent.Logout ? 'logout' : 'login'
  const base = COPY[stage]
  const copy = (intent === LoginIntent.Logout ? LOGOUT_COPY[stage] : undefined) ?? base

  return <div style={box} data-surrogate-stage={stage} data-surrogate-intent={intent}>
    <p>{t(`surrogate.${scope}.${copy.key}`, copy.en)}</p>
    {error != null && error !== '' &&
      <p style={{ color: '#b00', fontSize: '.875rem' }} role="alert">{error}</p>}
    {base.action != null && onAction != null && <button type="button" style={action} onClick={onAction}>
      {t(`surrogate.${scope}.${base.action[0]}`, base.action[1])}
    </button>}
  </div>
}
