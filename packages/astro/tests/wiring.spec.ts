import { describe, expect, test } from 'bun:test'
import { consentTrackingHelper } from '@owlmeans/consent'
import { astroHelper } from '../src/index.js'
import type { HeadTag } from '../src/index.js'

/** A tag as a tag package renders it: opaque strings this package must pass on untouched. */
const TAG: HeadTag = {
  head: "console.log('tag head with its own consent bootstrap')",
  noscript: '<img src="https://tags.example/pixel" alt="" />',
}

describe('@owlmeans/astro — head scripts', () => {
  test('without a tag it is consent\'s neutral bootstrap, and no noscript fallback', async () => {
    // A site with no tag still stamps the stored decision onto the category globals, so a snippet
    // that reads one sees a returning visitor's answer — but it declares no vendor's signals: that
    // is a tag package's head, passed as `tag`.
    const { head, noscript } = astroHelper.owlHeadScripts()

    expect(head).toBe(consentTrackingHelper.consentBootstrapScript())
    expect(head).toContain('owlConsentAnalytics')
    expect(head).not.toContain('dataLayer')
    expect(noscript).toBe('')
  })

  test('consent options reach the bootstrap', async () => {
    // The inline snippet is stamped once per page, so the categories it carries are the ones the
    // host configured — dropping them would silently desynchronise the snippet from the dialog.
    const { head } = astroHelper.owlHeadScripts({ consent: { storageKey: 'custom_consent_key' } })

    expect(head).toContain(JSON.stringify('custom_consent_key'))
  })

  test('a tag replaces the bootstrap: its head and noscript are returned exactly as rendered', async () => {
    // The tag package built `head` from the same consent options, bootstrap first and loader
    // second, so this package neither prepends a second bootstrap nor rewrites either string.
    const { head, noscript } = astroHelper.owlHeadScripts({ tag: TAG, consent: { storageKey: 'k' } })

    expect(head).toBe(TAG.head)
    expect(noscript).toBe(TAG.noscript)
  })

  test('a tag without a script-less form leaves noscript empty', async () => {
    expect(astroHelper.owlHeadScripts({ tag: { ...TAG, noscript: '' } }).noscript).toBe('')
  })

  test('adopt is empty with no linker configured, with or without a tag', async () => {
    expect(astroHelper.owlHeadScripts({ tag: TAG }).adopt).toBe('')
    expect(astroHelper.owlHeadScripts().adopt).toBe('')
  })

  test('adopt carries the standalone linker fragment when consent.linker is set', async () => {
    const consent = { linker: { domains: ['owlmeans.com', 'owlmeans.pl'] } }
    const { adopt, head } = astroHelper.owlHeadScripts({ consent })

    expect(adopt).toContain('URLSearchParams')
    expect(adopt).toContain(JSON.stringify('owlmeans.com'))
    // The bootstrap carries the SAME fragment for a page that runs it — `adopt` is the standalone
    // copy for a page (or an early stamp) that does not.
    expect(head).toContain('URLSearchParams')
  })

  test('adopt is built from consent even when a tag is passed', async () => {
    const { adopt } = astroHelper.owlHeadScripts({ tag: TAG, consent: { linker: { domains: ['owlmeans.com'] } } })

    expect(adopt).toContain('URLSearchParams')
    expect(adopt).toContain(JSON.stringify('owlmeans.com'))
  })
})

describe('@owlmeans/astro — legal paths', () => {
  test('a legal page is recognised with and without a locale prefix', async () => {
    // A legal page is where a visitor goes to READ what is collected; collecting there while they
    // read is the one thing it must not do.
    expect(astroHelper.isLegalPath('/legal')).toBe(true)
    expect(astroHelper.isLegalPath('/legal/privacy')).toBe(true)
    expect(astroHelper.isLegalPath('/pl/legal/terms')).toBe(true)
  })

  test('a page that merely starts with the word is not one', async () => {
    expect(astroHelper.isLegalPath('/legalese')).toBe(false)
    expect(astroHelper.isLegalPath('/about/legal')).toBe(false)
    expect(astroHelper.isLegalPath('/')).toBe(false)
  })

  test('the segment is configurable', async () => {
    expect(astroHelper.isLegalPath('/policies/privacy', 'policies')).toBe(true)
    expect(astroHelper.isLegalPath('/legal/privacy', 'policies')).toBe(false)
  })
})

describe('@owlmeans/astro — locale', () => {
  test('an undefined current locale falls back rather than rendering English', async () => {
    // `Astro.currentLocale` is undefined on a DEFAULT-locale page rather than the default locale,
    // so feeding it straight to a component renders English for everyone on `/` — including sites
    // where `/` is not English.
    expect(astroHelper.owlLocale(undefined)).toBe('en')
    expect(astroHelper.owlLocale(undefined, 'pl')).toBe('pl')
    expect(astroHelper.owlLocale('', 'pl')).toBe('pl')
  })

  test('a real locale is passed through', async () => {
    expect(astroHelper.owlLocale('uk', 'pl')).toBe('uk')
  })
})
