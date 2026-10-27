import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOT_PLATFORMS, BotActionKind, BotConnectionStatus, BotMatchMode, BotReceiveMode, BotRuleAction } from '@owlmeans/bot'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }
import fr from '../src/i18n/fr.json' with { type: 'json' }

const LANGUAGES: Record<string, unknown> = { pl, ru, be, uk, es, de, fr }

/** Every leaf key path in a nested translation object, e.g. `connections.title`. */
const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value == null) return [prefix]

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => leafKeys(child, prefix === '' ? key : `${prefix}.${key}`))
}

const valueOf = (resource: unknown, key: string): unknown =>
  key.split('.').reduce((node: any, part) => node?.[part], resource)

const placeholders = (text: string): string[] => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()

describe('@owlmeans/web-bot — translations', () => {
  const englishKeys = leafKeys(en).sort()

  test('English names every enum value and every credential of every platform descriptor', () => {
    const expected = [
      ...Object.values(BotConnectionStatus).map(value => `status.${value}`),
      ...Object.values(BotReceiveMode).map(value => `receive.${value}`),
      ...Object.values(BotActionKind).map(value => `action.${value}`),
      ...Object.values(BotRuleAction).map(value => `rule-action.${value}`),
      ...Object.values(BotMatchMode).flatMap(value => [`mode.${value}`, `mode-hint.${value}`]),
      ...Object.values(BOT_PLATFORMS).flatMap(descriptor => [
        `connections.hint.${descriptor.platform}`,
        ...descriptor.credentials.flatMap(field => [
          `credentials.${descriptor.platform}.${field.key}.label`, `credentials.${descriptor.platform}.${field.key}.hint`,
        ]),
      ]),
      ...[
        'connection-not-found', 'credentials-rejected', 'signature-rejected', 'transport-mismatch', 'unsupported-action',
        'rule-not-found', 'rule-invalid', 'connection-disabled', 'secret-missing', 'credentials-unreadable',
        'platform-refused', 'bot', 'generic',
      ].map(key => `errors.${key}`),
    ]
    for (const key of expected) expect([key, englishKeys.includes(key)]).toEqual([key, true])
  })

  test('every key the components ask for exists in English', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
    const literal = /\bt\('([a-z][a-z0-9.-]*)'/g
    for (const file of files(join(import.meta.dir, '../src/components')).filter(file => file.endsWith('.tsx'))) {
      const text = readFileSync(file, 'utf8')
      // A file may hold components reading under different prefixes: a key must resolve under one.
      const prefixes = [...text.matchAll(/useI18nLib\(BOT_I18N(?:, '([a-z.-]+)')?\)/g)].map(match => match[1] ?? '')
      for (const [, key] of text.matchAll(literal)) {
        const found = prefixes.some(prefix => valueOf(en, prefix === '' ? key : `${prefix}.${key}`) != null)
        expect([file, key, found]).toEqual([file, key, true])
      }
    }
  })

  for (const [lang, resource] of Object.entries(LANGUAGES)) {
    test(`${lang} has exactly the English keys, none empty, the same placeholders`, () => {
      expect(leafKeys(resource).sort()).toEqual(englishKeys)
      for (const key of englishKeys) {
        const value = valueOf(resource, key)
        expect([key, typeof value === 'string' && value.trim() !== '']).toEqual([key, true])
        expect([key, placeholders(value as string)]).toEqual([key, placeholders(valueOf(en, key) as string)])
      }
    })
  }
})
