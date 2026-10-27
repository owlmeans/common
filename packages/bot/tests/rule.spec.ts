import { describe, expect, test } from 'bun:test'
import { BOT_KEYWORD_MAX, BOT_KEYWORDS_MAX, BotMatchMode, BotRuleAction, botRuleHelper, type BotRule } from '../src/index.js'

const at = '2026-10-26T10:00:00.000Z'

const rule = (id: string, keywords: string[], extra: Partial<BotRule> = {}): BotRule => ({
  id,
  scope: 'org-1',
  connection: null,
  name: id,
  keywords,
  mode: BotMatchMode.Word,
  action: BotRuleAction.Delete,
  enabled: true,
  order: 0,
  createdAt: at,
  updatedAt: at,
  ...extra,
})

const ids = (text: string, rules: BotRule[]): string[] => botRuleHelper.match(text, rules).map(found => found.rule.id)

describe('botRuleHelper.match — word mode', () => {
  test('matches whole words only, case-insensitively and across punctuation', () => {
    const spam = rule('spam', ['casino'])

    expect(ids('Visit the CASINO!', [spam])).toEqual(['spam'])
    expect(ids('casino, now', [spam])).toEqual(['spam'])
    expect(ids('casinos are fun', [spam])).toEqual([])
    expect(ids('megacasino', [spam])).toEqual([])
  })

  test('a multi-word keyword is a phrase of consecutive words', () => {
    const offer = rule('offer', ['free money'])

    expect(ids('Get FREE   money now', [offer])).toEqual(['offer'])
    expect(ids('free—money', [offer])).toEqual(['offer'])
    expect(ids('money for free', [offer])).toEqual([])
    expect(ids('free real money', [offer])).toEqual([])
  })

  test('is Unicode-aware: Cyrillic, accents, compatibility forms and the German sharp s', () => {
    expect(ids('Купите СПАМ сейчас', [rule('ru', ['спам'])])).toEqual(['ru'])
    expect(ids('ёлка', [rule('yo', ['ЁЛКА'])])).toEqual(['yo'])
    expect(ids('Un café, por favor', [rule('es', ['CAFÉ'])])).toEqual(['es'])
    // Accents are kept: "cafe" is not "café".
    expect(ids('Un café', [rule('plain', ['cafe'])])).toEqual([])
    // NFKC: the full-width form and the ligature fold onto plain letters; NFD text onto NFC.
    expect(ids('ＣＡＳＩＮＯ night', [rule('wide', ['casino'])])).toEqual(['wide'])
    expect(ids('ﬁnance tips', [rule('lig', ['finance'])])).toEqual(['lig'])
    expect(ids('café au lait', [rule('nfd', ['café'])])).toEqual(['nfd'])
    expect(ids('STRASSE gesperrt', [rule('de', ['straße'])])).toEqual(['de'])
  })

  test('a keyword with no letters or digits never matches a word', () => {
    expect(ids('!!! now', [rule('bang', ['!!!'])])).toEqual([])
  })
})

describe('botRuleHelper.match — contains mode', () => {
  test('matches a folded substring, inside words too, with whitespace runs collapsed', () => {
    const inside = rule('inside', ['casino'], { mode: BotMatchMode.Contains })
    const punct = rule('punct', ['!!!'], { mode: BotMatchMode.Contains })
    const spaced = rule('spaced', ['free  money'], { mode: BotMatchMode.Contains })

    expect(ids('MEGACASINO.com', [inside])).toEqual(['inside'])
    expect(ids('wow!!! ok', [punct])).toEqual(['punct'])
    expect(ids('get free\n money', [spaced])).toEqual(['spaced'])
    expect(ids('no match here', [inside, punct, spaced])).toEqual([])
  })
})

describe('botRuleHelper.match — groups', () => {
  test('skips disabled rules and answers [] for empty text', () => {
    const off = rule('off', ['spam'], { enabled: false })

    expect(ids('spam', [off])).toEqual([])
    expect(ids('   ', [rule('on', ['spam'])])).toEqual([])
  })

  test('orders matches by rule order, ties keeping the given order', () => {
    const rules = [
      rule('third', ['spam'], { order: 3 }),
      rule('first', ['spam'], { order: 1 }),
      rule('tie-a', ['spam'], { order: 2 }),
      rule('tie-b', ['spam'], { order: 2 }),
    ]

    expect(ids('spam', rules)).toEqual(['first', 'tie-a', 'tie-b', 'third'])
  })

  test('reports every group a message matches, each with its own matched keywords as stored', () => {
    const abuse = rule('abuse', ['Idiot', 'stupid', 'moron'], { order: 1, action: BotRuleAction.Warn })
    const hours = rule('hours', ['opening hours', 'open'], { order: 2, action: BotRuleAction.Reply })
    const quiet = rule('quiet', ['delivery'], { order: 0 })
    const found = botRuleHelper.match('You idiot, what are the OPENING hours? stupid!', [hours, quiet, abuse])

    expect(found.map(match => [match.rule.id, match.keywords])).toEqual([
      ['abuse', ['Idiot', 'stupid']],
      ['hours', ['opening hours']],
    ])
  })
})

describe('botRuleHelper.normalizeKeywords', () => {
  test('trims, collapses inner whitespace, drops empties and folded duplicates keeping the first spelling', () => {
    expect(botRuleHelper.normalizeKeywords(['  Free   money ', '', '   ', 'free MONEY', 'Спам', 'СПАМ', 'café']))
      .toEqual(['Free money', 'Спам', 'café'])
  })

  test('caps the keyword length (in code points) and the list size', () => {
    const long = '😀'.repeat(BOT_KEYWORD_MAX + 10)
    const [capped] = botRuleHelper.normalizeKeywords([long])
    const many = botRuleHelper.normalizeKeywords(Array.from({ length: BOT_KEYWORDS_MAX + 5 }, (_, n) => `kw${n}`))

    expect(Array.from(capped)).toHaveLength(BOT_KEYWORD_MAX)
    expect(many).toHaveLength(BOT_KEYWORDS_MAX)
    expect(many[0]).toBe('kw0')
  })
})

describe('botRuleHelper.appliesTo', () => {
  test('a scope-wide rule applies to every connection, an own one to its connection only', () => {
    expect(botRuleHelper.appliesTo({ connection: null }, 'c1')).toBe(true)
    expect(botRuleHelper.appliesTo({}, 'c1')).toBe(true)
    expect(botRuleHelper.appliesTo({ connection: 'c1' }, 'c1')).toBe(true)
    expect(botRuleHelper.appliesTo({ connection: 'c2' }, 'c1')).toBe(false)
  })
})
