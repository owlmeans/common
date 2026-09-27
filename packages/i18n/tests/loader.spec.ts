import { describe, expect, test, beforeEach } from 'bun:test'
import {
  addI18nLib, addI18nLoader, initI18nResource, isI18nLanguageLoaded, loadI18nLanguage, LIB_NAMESPACE
} from '@owlmeans/i18n'
import { resetStorage } from './context.js'

beforeEach(resetStorage)

/** A promise the test settles by hand. */
const gate = () => {
  let open!: () => void
  let fail!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => { open = resolve; fail = reject })
  return { promise, open, fail }
}

/** Let every queued microtask and promise continuation run. */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))

describe('@owlmeans/i18n — language loaders', () => {
  test('a language with no loaders resolves at once and counts as loaded', async () => {
    expect(isI18nLanguageLoaded('pl')).toBe(true)
    await loadI18nLanguage('pl')
    expect(isI18nLanguageLoaded('pl')).toBe(true)
  })

  test('concurrent calls both await a loader added while they are pending', async () => {
    const first = gate()
    const late = gate()
    let lateRuns = 0
    addI18nLoader('de', async () => {
      await first.promise
      addI18nLib('de', 'errors', { minLength: 'Zu kurz' })
    })

    let aDone = false
    let bDone = false
    const a = loadI18nLanguage('de').then(() => { aDone = true })
    const b = loadI18nLanguage('de').then(() => { bDone = true })

    addI18nLoader('de', async () => {
      lateRuns++
      await late.promise
      addI18nLib('de', 'buttons', { ok: 'OK (de)' })
    })
    await flush()
    // Requested already, so the late loader started on registration — and only once.
    expect(lateRuns).toBe(1)

    first.open()
    await flush()
    expect(aDone).toBe(false)
    expect(bDone).toBe(false)
    expect(isI18nLanguageLoaded('de')).toBe(false)

    late.open()
    await Promise.all([a, b])
    expect(lateRuns).toBe(1)
    expect(isI18nLanguageLoaded('de')).toBe(true)
    expect(initI18nResource('de', 'errors', LIB_NAMESPACE)![0].data).toMatchObject({ minLength: 'Zu kurz' })
    expect(initI18nResource('de', 'buttons', LIB_NAMESPACE)![0].data).toMatchObject({ ok: 'OK (de)' })
  })

  test('a failed loader is retried by the next call; completed ones never re-run', async () => {
    let okRuns = 0
    let flakyRuns = 0
    addI18nLoader('ru', async () => { okRuns++ })
    addI18nLoader('ru', async () => {
      flakyRuns++
      if (flakyRuns === 1) {
        throw new Error('network down')
      }
      addI18nLib('ru', 'errors', { minLength: 'Слишком коротко' })
    })

    await expect(loadI18nLanguage('ru')).rejects.toThrow('network down')
    expect(isI18nLanguageLoaded('ru')).toBe(false)
    expect(okRuns).toBe(1)
    expect(flakyRuns).toBe(1)

    await loadI18nLanguage('ru')
    expect(isI18nLanguageLoaded('ru')).toBe(true)
    expect(okRuns).toBe(1)
    expect(flakyRuns).toBe(2)
    expect(initI18nResource('ru', 'errors', LIB_NAMESPACE)![0].data).toMatchObject({ minLength: 'Слишком коротко' })

    await loadI18nLanguage('ru')
    expect(okRuns).toBe(1)
    expect(flakyRuns).toBe(2)
  })

  test('a loader added after a call resolved is awaited by the next call', async () => {
    let firstRuns = 0
    addI18nLoader('uk', async () => { firstRuns++ })
    await loadI18nLanguage('uk')
    expect(isI18nLanguageLoaded('uk')).toBe(true)

    const late = gate()
    let lateRuns = 0
    addI18nLoader('uk', async () => {
      lateRuns++
      await late.promise
      addI18nLib('uk', 'errors', { minLength: 'Занадто коротко' })
    })
    // The language was requested before, so registration starts the loader straight away.
    expect(isI18nLanguageLoaded('uk')).toBe(false)
    await flush()
    expect(lateRuns).toBe(1)

    let done = false
    const next = loadI18nLanguage('uk').then(() => { done = true })
    await flush()
    expect(done).toBe(false)

    late.open()
    await next
    expect(lateRuns).toBe(1)
    expect(firstRuns).toBe(1)
    expect(isI18nLanguageLoaded('uk')).toBe(true)
    expect(initI18nResource('uk', 'errors', LIB_NAMESPACE)![0].data).toMatchObject({ minLength: 'Занадто коротко' })
  })

  test('a loader added while a call is pending is included in that same call', async () => {
    const first = gate()
    addI18nLoader('es', () => first.promise)

    let done = false
    const call = loadI18nLanguage('es').then(() => { done = true })

    let lateRuns = 0
    addI18nLoader('es', async () => {
      lateRuns++
      addI18nLib('es', 'errors', { minLength: 'Demasiado corto' })
    })

    first.open()
    await call
    expect(done).toBe(true)
    expect(lateRuns).toBe(1)
    expect(initI18nResource('es', 'errors', LIB_NAMESPACE)![0].data).toMatchObject({ minLength: 'Demasiado corto' })
  })

  test('a loader registered before any request does not run until the language is requested', async () => {
    let runs = 0
    addI18nLoader('be', async () => { runs++ })
    await flush()
    expect(runs).toBe(0)
    expect(isI18nLanguageLoaded('be')).toBe(false)

    await loadI18nLanguage('be')
    expect(runs).toBe(1)
  })
})
