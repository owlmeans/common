import { describe, expect, test } from 'bun:test'
import { BotTextMatch, botTextHelper } from '../src/index.js'

const { matched, phrasesOf, fold, tokensOf } = botTextHelper

describe('botTextHelper.fold and tokensOf', () => {
  test('fold applies NFKC, a case fold and NFKC again', () => {
    expect(fold('STRASSE')).toBe(fold('straße'))
    expect(fold('ＣＡＳＩＮＯ')).toBe('casino')
    expect(fold('ﬁnance')).toBe('finance')
    expect(fold('ЁЛКА')).toBe('ёлка')
  })

  test('tokens are runs of letters, marks, digits and _ — punctuation splits', () => {
    expect(tokensOf('Free—MONEY, now_2!')).toEqual(['free', 'money', 'now_2'])
    expect(tokensOf('!!! ...')).toEqual([])
  })
})

describe('botTextHelper.matched — word mode (the default)', () => {
  test('matches whole words only, case-insensitively and across punctuation', () => {
    expect(matched('Visit the CASINO!', ['casino'])).toEqual(['casino'])
    expect(matched('casino, now', ['casino'])).toEqual(['casino'])
    expect(matched('casinos are fun', ['casino'])).toEqual([])
    expect(matched('megacasino', ['casino'])).toEqual([])
  })

  test('a multi-word phrase must appear as consecutive words', () => {
    expect(matched('Get FREE   money now', ['free money'])).toEqual(['free money'])
    expect(matched('free—money', ['free money'])).toEqual(['free money'])
    expect(matched('money for free', ['free money'])).toEqual([])
    expect(matched('free real money', ['free money'])).toEqual([])
  })

  test('is Unicode-aware: Cyrillic, accents, compatibility forms and the German sharp s', () => {
    expect(matched('Купите СПАМ сейчас', ['спам'])).toEqual(['спам'])
    expect(matched('ёлка', ['ЁЛКА'])).toEqual(['ЁЛКА'])
    expect(matched('Un café, por favor', ['CAFÉ'])).toEqual(['CAFÉ'])
    // Accents are kept: "cafe" is not "café".
    expect(matched('Un café', ['cafe'])).toEqual([])
    // NFKC: the full-width form and the ligature fold onto plain letters; NFD text onto NFC.
    expect(matched('ＣＡＳＩＮＯ night', ['casino'])).toEqual(['casino'])
    expect(matched('ﬁnance tips', ['finance'])).toEqual(['finance'])
    expect(matched('café au lait', ['café'])).toEqual(['café'])
    expect(matched('STRASSE gesperrt', ['straße'])).toEqual(['straße'])
  })

  test('a phrase with no letters or digits never matches a word', () => {
    expect(matched('!!! now', ['!!!'])).toEqual([])
    expect(matched('!!! now', ['!!!'], BotTextMatch.Word)).toEqual([])
  })
})

describe('botTextHelper.matched — contains mode', () => {
  test('matches a folded substring, inside words too, with whitespace runs collapsed', () => {
    const contains = BotTextMatch.Contains

    expect(matched('MEGACASINO.com', ['casino'], contains)).toEqual(['casino'])
    expect(matched('wow!!! ok', ['!!!'], contains)).toEqual(['!!!'])
    expect(matched('get free\n money', ['free  money'], contains)).toEqual(['free  money'])
    expect(matched('no match here', ['casino', '!!!', 'free money'], contains)).toEqual([])
  })

  test('finds a phrase in a script written without spaces', () => {
    expect(matched('今日は営業時間を教えて', ['営業時間'], BotTextMatch.Contains)).toEqual(['営業時間'])
  })
})

describe('botTextHelper.matched — the answer', () => {
  test('lists every phrase found, in the given order, as given', () => {
    expect(matched('You idiot, what are the OPENING hours? stupid!', ['moron', 'stupid', 'Idiot', 'opening hours']))
      .toEqual(['stupid', 'Idiot', 'opening hours'])
  })

  test('answers each phrase once: a folded repeat is skipped, the first spelling kept', () => {
    expect(matched('spam spam SPAM', ['Spam', 'spam', 'SPAM'])).toEqual(['Spam'])
  })

  test('empty text, blank phrases and non-strings never match', () => {
    expect(matched('   ', ['spam'])).toEqual([])
    expect(matched('spam', ['', '   '])).toEqual([])
    expect(matched('spam', [42 as unknown as string, 'spam'])).toEqual(['spam'])
    expect(matched(undefined as unknown as string, ['spam'])).toEqual([])
  })
})

describe('botTextHelper.phrasesOf', () => {
  test('splits on commas and line breaks, trims, collapses inner whitespace and drops empties', () => {
    expect(phrasesOf('  Free   money , casino,\n\nopening hours\r\n,  '))
      .toEqual(['Free money', 'casino', 'opening hours'])
  })

  test('drops folded duplicates keeping the first spelling — across the items of a list too', () => {
    expect(phrasesOf(['  Free   money ', '', '   ', 'free MONEY', 'Спам', 'СПАМ, café'])).toEqual(['Free money', 'Спам', 'café'])
  })

  test('splits each item of a list and ignores what is not a string', () => {
    expect(phrasesOf(['spam, scam', 7 as unknown as string, 'casino'])).toEqual(['spam', 'scam', 'casino'])
    expect(phrasesOf('')).toEqual([])
  })
})
