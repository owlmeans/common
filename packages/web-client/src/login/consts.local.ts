import type { CSSProperties } from 'react'
import { SurrogateStage } from './consts.js'

/**
 * The whole of what a login window shows.
 *
 * Plain elements and inline styles on purpose. This renders in a popup opened by a `web-panel` app,
 * a `mui-panel` app and a generated Tailwind app alike, and none of their stylesheets is loaded
 * here — a class name would simply do nothing. It is also the reason this component carries no
 * dependency on a UI family at all.
 */
export const box: CSSProperties = {
  maxWidth: '22rem', margin: '15vh auto', padding: '1.5rem', textAlign: 'center',
  fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
}

export const action: CSSProperties = {
  marginTop: '1rem', padding: '.625rem 1.25rem', fontSize: '1rem',
  cursor: 'pointer', borderRadius: '.375rem', border: '1px solid currentColor',
}

export const COPY: Record<SurrogateStage, { key: string, en: string, action?: [string, string] }> = {
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

export const LOGOUT_COPY: Partial<Record<SurrogateStage, { key: string, en: string }>> = {
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
