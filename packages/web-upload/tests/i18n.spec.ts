import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { i18nHelper, LIB_NAMESPACE } from '@owlmeans/i18n'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }
import fr from '../src/i18n/fr.json' with { type: 'json' }
import { UploadEntryStatus, WEB_UPLOAD_RESOURCE } from '../src/index.js'
import { UploadReason } from '@owlmeans/upload'

const LANGUAGES: Record<string, unknown> = { en, pl, ru, be, uk, es, de, fr }

const leaves = (value: unknown, prefix = ''): string[] => typeof value !== 'object' || value == null
  ? [prefix]
  : Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => leaves(child, prefix === '' ? key : `${prefix}.${key}`))

const valueOf = (resource: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], resource)

const placeholders = (text: string): string[] => [...text.matchAll(/\{([\w-]+)\}/g)].map(match => match[1]).sort()

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : []
})

describe('@owlmeans/web-upload — i18n', () => {
  const keys = leaves(en).sort()

  test('every language has every English key, the same placeholders, and nothing else', () => {
    for (const [language, resource] of Object.entries(LANGUAGES)) {
      expect({ language, keys: leaves(resource).sort() }).toEqual({ language, keys })
      for (const key of keys) {
        const text = valueOf(resource, key)
        expect(typeof text === 'string' && text.trim() !== '').toBe(true)
        expect({ language, key, placeholders: placeholders(text as string) })
          .toEqual({ language, key, placeholders: placeholders(valueOf(en, key) as string) })
      }
    }
  })

  test('every status and every rejection reason has a string; every literal key in the sources exists', () => {
    for (const status of Object.values(UploadEntryStatus)) {
      expect(keys).toContain(`status.${status}`)
    }
    for (const reason of Object.values(UploadReason)) {
      expect(keys).toContain(`reason.${reason}`)
    }
    const literal = /\btext\(\s*'([a-z][\w.-]*)'/g
    for (const file of sourceFiles(join(import.meta.dir, '../src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(literal)) {
        expect({ file, key: match[1], known: keys.includes(match[1]) }).toEqual({ file, key: match[1], known: true })
      }
    }
  })

  test('the package registers all eight languages in the library namespace at import', () => {
    for (const language of Object.keys(LANGUAGES)) {
      const resolved = i18nHelper.resolveI18nResource(language, WEB_UPLOAD_RESOURCE, LIB_NAMESPACE) as Record<string, unknown> | null
      expect(valueOf(resolved, 'pickers.files')).toBe(valueOf(LANGUAGES[language], 'pickers.files'))
    }
  })
})
