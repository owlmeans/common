import { CAPTCHA_FALLBACK_LANGUAGE } from './consts.js'
import type { CaptchaNoticeHelper, CaptchaNoticeText, CaptchaTexts } from './types.js'

export const createCaptchaNoticeHelper = (): CaptchaNoticeHelper => {
  const baseOf = (language?: string | null): string =>
    language?.trim().split(/[-_]/)[0]?.toLowerCase() || CAPTCHA_FALLBACK_LANGUAGE

  const noticeOf: CaptchaNoticeHelper['noticeOf'] = (client, language) => {
    if (client?.notice == null || client.texts == null) {
      return null
    }
    const texts: CaptchaTexts | undefined = client.texts[baseOf(language)] ?? client.texts[CAPTCHA_FALLBACK_LANGUAGE]
    const sentence = texts?.notice
    if (texts == null || sentence == null || sentence === '') {
      return null
    }
    const links: CaptchaNoticeText['links'] = {}
    for (const [name, href] of Object.entries(client.notice.links)) {
      links[name] = { text: texts[name] ?? name, href }
    }

    return { sentence, links }
  }

  return { noticeOf }
}

export const captchaNoticeHelper = createCaptchaNoticeHelper()
