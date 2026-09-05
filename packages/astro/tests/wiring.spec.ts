import { describe, expect, test } from 'bun:test'
import { isLegalPath, owlHeadScripts, owlLocale } from '../src/index.js'

describe('@owlmeans/astro — head scripts', () => {
  test('with a container, consent comes first and the noscript frame is emitted', async () => {
    const { head, noscript } = owlHeadScripts({ gtm: { id: 'GTM-ASTRO01' } })

    expect(head.indexOf("'consent','default'")).toBeLessThan(head.indexOf('gtm.js'))
    expect(noscript).toContain('GTM-ASTRO01')
  })

  test('without a container it is still the consent defaults, and no frame', async () => {
    // A site with no tag manager still needs the defaults on the queue: a stored decision has to
    // reach whatever the page loads later, and a page that declared nothing is a page where a
    // later tag sees no state at all.
    const { head, noscript } = owlHeadScripts()

    expect(head).toContain("'consent','default'")
    expect(head).not.toContain('gtm.js')
    expect(noscript).toBe('')
  })

  test('consent options reach the container snippet', async () => {
    // The inline snippet is stamped once per page, so the categories it carries are the ones the
    // host configured — passing them to `owlHeadScripts` and having them dropped would silently
    // desynchronise the snippet from the component.
    const { head } = owlHeadScripts({
      gtm: { id: 'GTM-ASTRO01' },
      consent: { storageKey: 'custom_consent_key' },
    })

    expect(head).toContain(JSON.stringify('custom_consent_key'))
  })
})

describe('@owlmeans/astro — legal paths', () => {
  test('a legal page is recognised with and without a locale prefix', async () => {
    // A legal page is where a visitor goes to READ what is collected; collecting there while they
    // read is the one thing it must not do.
    expect(isLegalPath('/legal')).toBe(true)
    expect(isLegalPath('/legal/privacy')).toBe(true)
    expect(isLegalPath('/pl/legal/terms')).toBe(true)
  })

  test('a page that merely starts with the word is not one', async () => {
    expect(isLegalPath('/legalese')).toBe(false)
    expect(isLegalPath('/about/legal')).toBe(false)
    expect(isLegalPath('/')).toBe(false)
  })

  test('the segment is configurable', async () => {
    expect(isLegalPath('/policies/privacy', 'policies')).toBe(true)
    expect(isLegalPath('/legal/privacy', 'policies')).toBe(false)
  })
})

describe('@owlmeans/astro — locale', () => {
  test('an undefined current locale falls back rather than rendering English', async () => {
    // `Astro.currentLocale` is undefined on a DEFAULT-locale page rather than the default locale,
    // so feeding it straight to a component renders English for everyone on `/` — including sites
    // where `/` is not English.
    expect(owlLocale(undefined)).toBe('en')
    expect(owlLocale(undefined, 'pl')).toBe('pl')
    expect(owlLocale('', 'pl')).toBe('pl')
  })

  test('a real locale is passed through', async () => {
    expect(owlLocale('uk', 'pl')).toBe('uk')
  })
})
