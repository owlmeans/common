import { createService } from '@owlmeans/context'
import { appendStateResource, stateAlias } from '@owlmeans/state'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import { CONSENT_WIDGET_SERVICE } from './consts.js'
import type {
  ConsentWidgetPresenceRecord, ConsentWidgetService, ConsentWidgetServiceAppend
} from './types.js'

/** The presence flag's state-resource alias — `single: true`, no id. */
export const CONSENT_WIDGET_STATE = stateAlias<ConsentWidgetPresenceRecord>('consent-widget-presence')

/**
 * Tracks how many cookie-preferences menu rows are currently mounted, and publishes a plain
 * present/absent flag into a state resource for `PanelCookieConsent` to read.
 *
 * Ref-counted rather than a boolean latch: a nav-mode transition can mount a new menu row before
 * the old one unmounts (confirmed reachable in manager-web's own nav — a stale header still
 * rendering its own dropdown for one commit while a project screen's dropdown has already
 * mounted), and React 18 StrictMode double-invokes mount/cleanup in dev. Counting means the
 * published flag only ever flips on a genuine 0-to-1 or 1-to-0 transition.
 */
export const createConsentWidgetService = (
  alias: string = CONSENT_WIDGET_SERVICE
): ConsentWidgetService => {
  let count = 0

  const publish = (present: boolean): void => {
    const ctx = service.assertCtx<ClientConfig, ClientContext<ClientConfig>>()
    void ctx.getStateResource<ConsentWidgetPresenceRecord>(CONSENT_WIDGET_STATE).save({ present })
  }

  const service: ConsentWidgetService = createService<ConsentWidgetService>(alias, {
    claim: () => {
      count += 1
      if (count === 1) {
        publish(true)
      }

      let released = false
      return () => {
        if (released) {
          return
        }
        released = true
        count = Math.max(0, count - 1)
        if (count === 0) {
          publish(false)
        }
      }
    },

    present: () => count > 0,
  })

  return service
}

export const appendConsentWidgetService = <C extends ClientConfig, T extends ClientContext<C>>(
  ctx: T, alias: string = CONSENT_WIDGET_SERVICE
): T & ConsentWidgetServiceAppend => {
  const _ctx = ctx as T & ConsentWidgetServiceAppend

  appendStateResource<C, T, ConsentWidgetPresenceRecord>(
    ctx, CONSENT_WIDGET_STATE, { single: true, default: () => ({ present: false }) }
  )

  if (!_ctx.hasService(alias)) {
    _ctx.registerService(createConsentWidgetService(alias))
  }

  _ctx.consentWidget = () => _ctx.service(alias)

  return _ctx
}
