import type { LogPlugin } from '@owlmeans/log'
import { consentedAnalyticsPlugin } from './consented.js'
import type { ConsentedAnalyticsOptions, DataLayerWindow } from './types.js'

/**
 * The tag-manager sink: pushes `{ event, ...data }` onto `window.dataLayer`, consent permitting.
 *
 * ```ts
 * addLogPlugin(gtmAnalyticsPlugin({ allow: ['project.created'] }))
 * logger('projects').info('Created', { kind: 'web' }, { analytics: 'project.created' })
 * ```
 */
export const gtmAnalyticsPlugin = (options: ConsentedAnalyticsOptions = {}): LogPlugin =>
  consentedAnalyticsPlugin(payload => {
    if (typeof window === 'undefined') {
      return
    }
    const win = window as unknown as DataLayerWindow
    win.dataLayer = win.dataLayer ?? []
    win.dataLayer.push(payload)
  }, { name: 'gtm', ...options })
