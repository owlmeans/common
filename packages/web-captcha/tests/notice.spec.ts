import { describe, expect, test } from 'bun:test'
import { captchaNoticeHelper } from '../src/notice.js'
import { makeTestClient } from './context.js'

const client = makeTestClient('test', {
  notice: { links: { privacy: 'https://example.org/privacy', terms: 'https://example.org/terms' } },
  texts: {
    en: { notice: 'Checked by {{privacy}} and {{terms}}.', privacy: 'Privacy', terms: 'Terms' },
    pl: { notice: 'Sprawdzone: {{privacy}}, {{terms}}.', privacy: 'Prywatność', terms: 'Warunki' },
  },
})

describe('@owlmeans/web-captcha — notice', () => {
  test('reads the sentence and the link labels in the reader\'s base language', () => {
    expect(captchaNoticeHelper.noticeOf(client, 'pl-PL')).toEqual({
      sentence: 'Sprawdzone: {{privacy}}, {{terms}}.',
      links: {
        privacy: { text: 'Prywatność', href: 'https://example.org/privacy' },
        terms: { text: 'Warunki', href: 'https://example.org/terms' },
      },
    })
  })

  test('falls back to English for a language the client does not ship, and when none is given', () => {
    expect(captchaNoticeHelper.noticeOf(client, 'de')?.sentence).toBe('Checked by {{privacy}} and {{terms}}.')
    expect(captchaNoticeHelper.noticeOf(client)?.links.terms.text).toBe('Terms')
  })

  test('no notice for a client that needs none, ships no sentence, or is missing', () => {
    expect(captchaNoticeHelper.noticeOf(makeTestClient())).toBeNull()
    expect(captchaNoticeHelper.noticeOf({ ...client, texts: { en: { privacy: 'Privacy' } } })).toBeNull()
    expect(captchaNoticeHelper.noticeOf(null, 'en')).toBeNull()
  })
})
