import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONSENT_CATEGORIES, DEFAULT_CONSENT_MESSAGES } from '@owlmeans/consent'

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src')

const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name)

  return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
})

describe('@owlmeans/web-consent — the packaged bundle', () => {
  test('every key a component reads has a bundle entry', () => {
    // A key with no entry does not fail: it renders its English default in every language, and
    // the page looks translated everywhere except that one line. The privacy and terms link
    // labels shipped that way — so the keys are read from the components themselves, and a new
    // `t('…')` without an entry fails here instead of in a reader's language.
    const read = new Set<string>()
    for (const file of sources(src)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('([A-Za-z]+)'/g)) {
        read.add(match[1])
      }
    }
    for (const category of DEFAULT_CONSENT_CATEGORIES) {
      read.add(category.labelKey)
      read.add(category.descriptionKey)
    }

    expect(read.size).toBeGreaterThan(20)
    const missing = [...read].filter(key => DEFAULT_CONSENT_MESSAGES.en[key] == null)
    expect(missing).toEqual([])
  })
})
