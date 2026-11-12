import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { CONSENT_MARKETING, consentStore } from '@owlmeans/consent'
import { addLogPlugin, logger, resetLog } from '@owlmeans/log'
import { consentedAnalyticsPlugin } from '@owlmeans/web-log'

let granted: string[] = []
const original = consentStore.granted

beforeEach(() => {
  resetLog()
  granted = []
  consentStore.granted = key => granted.includes(key)
})

afterEach(() => {
  consentStore.granted = original
  resetLog()
})

describe('@owlmeans/web-log', () => {
  test('drops an event while analytics consent is missing — it is never queued', () => {
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload)))
    logger('ui').info('x', { a: 1 }, { analytics: 'page_view' })
    expect(sent).toEqual([])
    granted = ['analytics']
    expect(sent).toEqual([])
  })

  test('sends {event, ...data} once consent is granted', () => {
    granted = ['analytics']
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload)))
    logger('ui').info('x', { plan: 'pro' }, { analytics: 'subscription.started' })
    expect(sent).toEqual([{ event: 'subscription.started', plan: 'pro' }])
  })

  test('a non-object datum travels as value', () => {
    granted = ['analytics']
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload)))
    logger('ui').info('x', 3, { analytics: 'count' })
    expect(sent).toEqual([{ event: 'count', value: 3 }])
  })

  test('ignores plain console calls', () => {
    granted = ['analytics']
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload)))
    logger('ui').info('just a line')
    expect(sent).toEqual([])
  })

  test('the category is configurable', () => {
    granted = ['analytics']
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload), { category: CONSENT_MARKETING }))
    logger('ui').info('x', undefined, { analytics: 'purchase' })
    expect(sent).toEqual([])
    granted = ['analytics', CONSENT_MARKETING]
    logger('ui').info('x', undefined, { analytics: 'purchase' })
    expect(sent).toEqual([{ event: 'purchase' }])
  })

  test('allow-list and map shape what is sent', () => {
    granted = ['analytics']
    const sent: Record<string, unknown>[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload), {
      allow: ['keep'], map: event => ({ name: event.event, scope: event.scope }),
    }))
    logger('ui').info('a', undefined, { analytics: 'keep' })
    logger('ui').info('b', undefined, { analytics: 'skip' })
    expect(sent).toEqual([{ name: 'keep', scope: 'ui' }])
  })

  test('a map returning undefined drops the event', () => {
    granted = ['analytics']
    const sent: unknown[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => sent.push(payload), { map: () => undefined }))
    logger('ui').info('a', undefined, { analytics: true })
    expect(sent).toEqual([])
  })

  test('a second plugin of the same name replaces the first', () => {
    granted = ['analytics']
    const first: unknown[] = []
    const second: unknown[] = []
    addLogPlugin(consentedAnalyticsPlugin(payload => first.push(payload), { name: 'sink' }))
    addLogPlugin(consentedAnalyticsPlugin(payload => second.push(payload), { name: 'sink' }))
    logger('ui').info('a', undefined, { analytics: 'e' })
    expect(first).toEqual([])
    expect(second).toEqual([{ event: 'e' }])
  })
})
