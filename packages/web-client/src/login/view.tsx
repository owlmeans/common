import type { CSSProperties, FC } from 'react'
import { LoginIntent } from '@owlmeans/client-auth/login'

/** What the surrogate window is doing, from the point of view of the person watching it. */
export enum SurrogateStage {
  /** Working. No control — there is nothing for the user to do but wait. */
  Working = 'working',
  /** Needs a click: the flow cannot continue without a fresh gesture. */
  Gesture = 'gesture',
  /** Done here; handing the result back and closing. */
  Handing = 'handing',
  /** Acted, but with no channel back to the window that asked. */
  Orphaned = 'orphaned',
  /** Ended with nothing. */
  Failed = 'failed',
  /** Not a surrogate at all — someone opened this address directly. */
  Standalone = 'standalone',
}

export interface SurrogateViewProps {
  stage: SurrogateStage
  intent: LoginIntent
  onAction?: () => void
  error?: string
  translate?: (key: string, defaultValue: string) => string
}

/**
 * The whole of what a login window shows.
 *
 * Plain elements and inline styles on purpose. This renders in a popup opened by a `web-panel` app,
 * a `mui-panel` app and a generated Tailwind app alike, and none of their stylesheets is loaded
 * here — a class name would simply do nothing. It is also the reason this component carries no
 * dependency on a UI family at all.
 */
const box: CSSProperties = {
  maxWidth: '22rem', margin: '15vh auto', padding: '1.5rem', textAlign: 'center',
  fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
}

const action: CSSProperties = {
  marginTop: '1rem', padding: '.625rem 1.25rem', fontSize: '1rem',
  cursor: 'pointer', borderRadius: '.375rem', border: '1px solid currentColor',
}

const COPY: Record<SurrogateStage, { key: string, en: string, action?: [string, string] }> = {
  [SurrogateStage.Working]: { key: 'working', en: 'Signing you in…' },
  [SurrogateStage.Gesture]: {
    key: 'gesture.title', en: 'Continue to sign in.', action: ['gesture.action', 'Sign in'],
  },
  [SurrogateStage.Handing]: { key: 'handing', en: 'Done. Returning to the application…' },
  [SurrogateStage.Orphaned]: {
    key: 'orphaned', en: 'Signed in. You can close this window and continue in the application.',
    action: ['close', 'Close'],
  },
  [SurrogateStage.Failed]: {
    key: 'failed', en: 'That did not complete. You can close this window and try again.',
    action: ['close', 'Close'],
  },
  [SurrogateStage.Standalone]: {
    key: 'standalone.title', en: 'This page is used to sign in from another window.',
    action: ['standalone.action', 'Open the application'],
  },
}

const LOGOUT_COPY: Partial<Record<SurrogateStage, { key: string, en: string }>> = {
  [SurrogateStage.Working]: { key: 'working', en: 'Signing you out…' },
  [SurrogateStage.Gesture]: { key: 'gesture.title', en: 'Continue to sign out.' },
  [SurrogateStage.Handing]: { key: 'handing', en: 'Signed out. Returning to the application…' },
  [SurrogateStage.Orphaned]: {
    key: 'orphaned', en: 'Signed out. You can close this window.',
  },
  [SurrogateStage.Failed]: {
    key: 'failed', en: 'Sign-out did not complete here. You can close this window.',
  },
}

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
