import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { consentStore } from '@owlmeans/consent'
import { addLogPlugin, logger, resetLog } from '@owlmeans/log'
import { consentedAnalyticsPlugin, gtmAnalyticsPlugin } from '@owlmeans/web-log'

const win = globalThis as unknown as { window?: { dataLayer?: unknown[] } }

let granted = false
const original = consentStore.granted

beforeEach(() => {
  resetLog()
  win.window = {}
  granted = false
  consentStore.granted = () => granted
})

afterEach(() => {
  consentStore.granted = original
  delete win.window
  resetLog()
})

describe('@owlmeans/web-log', () => {
  test('drops an event while analytics consent is missing — it is never queued', () => {
    addLogPlugin(gtmAnalyticsPlugin())
    logger('ui').info('x', { a: 1 }, { analytics: 'page_view' })
    expect(win.window?.dataLayer).toBeUndefined()
    granted = true
    expect(win.window?.dataLayer).toBeUndefined()
  })

  test('pushes {event, ...data} to the dataLayer once consent is granted', () => {
    granted = true
    addLogPlugin(gtmAnalyticsPlugin())
    logger('ui').info('x', { plan: 'pro' }, { analytics: 'subscription.started' })
    expect(win.window?.dataLayer).toEqual([{ event: 'subscription.started', plan: 'pro' }])
  })

  test('ignores plain console calls', () => {
    granted = true
    addLogPlugin(gtmAnalyticsPlugin())
    logger('ui').info('just a line')
    expect(win.window?.dataLayer).toBeUndefined()
  })

  test('allow-list and map shape what is sent', () => {
    granted = true
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload), {
      allow: ['keep'], map: event => ({ name: event.event, scope: event.scope }),
    }))
    logger('ui').info('a', undefined, { analytics: 'keep' })
    logger('ui').info('b', undefined, { analytics: 'skip' })
    expect(sent).toEqual([{ name: 'keep', scope: 'ui' }])
  })

  test('a map returning undefined drops the event', () => {
    granted = true
    const sent: unknown[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload), { map: () => undefined }))
    logger('ui').info('a', undefined, { analytics: true })
    expect(sent).toEqual([])
  })
})
