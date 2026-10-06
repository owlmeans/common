import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { addLogPlugin, logger, resetLog, logStateHelper } from '@owlmeans/log'
import {
  PREVIEW_ANALYTICS_TYPE, PREVIEW_REPORTER_FLAG, SLOT_EVENTS_ENV, TARGET_EVENT_MARKER, TARGET_EVENT_MAX,
  targetEventHelper, viablePreviewPlugin, viableSlotPlugin,
} from '@owlmeans/viable-log'
import type { TargetEvent } from '@owlmeans/viable-log'

const sample = (patch: Partial<TargetEvent> = {}): TargetEvent => ({
  v: 1, kind: 'error', ts: 1, level: 'error', scope: 'api', message: 'boom', ...patch,
})

describe('target event line', () => {
  test('round-trips through targetEventLine and parseTargetEventLine', () => {
    const event = sample({ data: { id: 1 }, error: { name: 'Error', message: 'x', stack: 's', incidentId: 'i' }, event: 'e' })
    expect(targetEventHelper.parseTargetEventLine(targetEventHelper.targetEventLine(event))).toEqual(event)
  })

  test('finds the marker anywhere in a line (prefixed stdout)', () => {
    expect(targetEventHelper.parseTargetEventLine(`12:00 ${targetEventHelper.targetEventLine(sample())}`)?.message).toBe('boom')
  })

  test('rejects a line without a marker, broken JSON, a wrong version or kind, a bad level', () => {
    expect(targetEventHelper.parseTargetEventLine('plain')).toBeUndefined()
    expect(targetEventHelper.parseTargetEventLine(`${TARGET_EVENT_MARKER}{nope`)).toBeUndefined()
    expect(targetEventHelper.parseTargetEventLine(`${TARGET_EVENT_MARKER}${JSON.stringify({ ...sample(), v: 2 })}`)).toBeUndefined()
    expect(targetEventHelper.parseTargetEventLine(`${TARGET_EVENT_MARKER}${JSON.stringify({ ...sample(), kind: 'x' })}`)).toBeUndefined()
    expect(targetEventHelper.parseTargetEventLine(`${TARGET_EVENT_MARKER}${JSON.stringify({ ...sample(), level: 'fatal' })}`)).toBeUndefined()
    expect(targetEventHelper.parseTargetEventLine(`${TARGET_EVENT_MARKER}null`)).toBeUndefined()
  })

  test('clips untrusted text fields and ignores unknown fields', () => {
    const line = `${TARGET_EVENT_MARKER}${JSON.stringify({ ...sample(), message: 'm'.repeat(5000), extra: 'x', scope: 7 })}`
    const parsed = targetEventHelper.parseTargetEventLine(line)!
    expect(parsed.message.length).toBe(2000)
    expect(parsed.scope).toBe('target')
    expect('extra' in parsed).toBe(false)
  })

  test('an over-long event loses its stack first, then its data, and stays under the cap', () => {
    const stackless = targetEventHelper.targetEventLine(sample({ error: { name: 'E', message: 'm', stack: 's'.repeat(TARGET_EVENT_MAX * 2) } }))
    expect(stackless.length).toBeLessThanOrEqual(TARGET_EVENT_MAX)
    expect(targetEventHelper.parseTargetEventLine(stackless)?.error?.message).toBe('m')
    const dataless = targetEventHelper.targetEventLine(sample({ data: 'd'.repeat(TARGET_EVENT_MAX * 2) }))
    expect(dataless.length).toBeLessThanOrEqual(TARGET_EVENT_MAX)
    expect(targetEventHelper.parseTargetEventLine(dataless)?.message).toBe('boom')
  })
})

describe('viablePreviewPlugin', () => {
  const win = globalThis as unknown as { window?: Record<string, unknown> }
  beforeEach(() => { resetLog() })
  afterEach(() => { delete win.window; resetLog() })

  test('posts analytics events through the reporter channel', () => {
    const posted: unknown[][] = []
    win.window = { [PREVIEW_REPORTER_FLAG]: { v: 2, post: (...args: unknown[]) => posted.push(args) } }
    addLogPlugin(viablePreviewPlugin())
    logger('ui').info('Opened', { page: 'home' }, { analytics: 'page_view' })
    expect(posted).toHaveLength(1)
    expect(posted[0][0]).toBe(PREVIEW_ANALYTICS_TYPE)
    expect(posted[0][1]).toMatchObject({ event: 'page_view', scope: 'ui', data: { page: 'home' } })
  })

  test('is inert without the channel — a flag that is a bare `true` is not a channel', () => {
    addLogPlugin(viablePreviewPlugin())
    expect(() => logger('ui').info('x', undefined, { analytics: true })).not.toThrow()
    win.window = { [PREVIEW_REPORTER_FLAG]: true }
    expect(() => logger('ui').info('x', undefined, { analytics: true })).not.toThrow()
  })
})

describe('viableSlotPlugin', () => {
  const written: string[] = []
  const proc = globalThis.process
  const realWrite = proc.stdout.write.bind(proc.stdout)
  let saved: ReturnType<typeof logStateHelper.nativeConsole>

  beforeEach(() => {
    resetLog()
    written.length = 0
    saved = { ...logStateHelper.nativeConsole() }
    for (const key of Object.keys(logStateHelper.nativeConsole()) as (keyof ReturnType<typeof logStateHelper.nativeConsole>)[]) logStateHelper.nativeConsole()[key] = () => undefined
    ;(proc.stdout as { write: unknown }).write = (chunk: string) => { written.push(String(chunk)); return true }
  })
  afterEach(() => {
    ;(proc.stdout as { write: unknown }).write = realWrite
    Object.assign(logStateHelper.nativeConsole(), saved)
    delete proc.env[SLOT_EVENTS_ENV]
    resetLog()
  })

  test('writes nothing unless the publisher asked for it', () => {
    addLogPlugin(viableSlotPlugin())
    logger('api').error('boom', new Error('x'))
    expect(written).toEqual([])
  })

  test('writes error records and analytics events as marked lines when asked', () => {
    proc.env[SLOT_EVENTS_ENV] = '1'
    addLogPlugin(viableSlotPlugin())
    const error = Object.assign(new Error('db down'), { incidentId: 'inc-1' })
    logger('api').error('Request failed', error)
    logger('api').info('Signed up', { plan: 'free' }, { analytics: 'signup' })
    logger('api').info('plain info')
    logger('api').warn('plain warn')
    const events = written.map(line => targetEventHelper.parseTargetEventLine(line)!)
    expect(events.map(e => [e.kind, e.event ?? e.message])).toEqual([['error', 'Request failed'], ['analytics', 'signup']])
    expect(events[0].error).toMatchObject({ name: 'Error', message: 'db down', incidentId: 'inc-1' })
    expect(events[1].data).toEqual({ plan: 'free' })
  })
})
