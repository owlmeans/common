import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = join(import.meta.dir, '../src')

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)

  return entry.isDirectory() ? sourceFiles(path) : [path]
})

describe('@owlmeans/web-bot — package boundary', () => {
  test('does not use consumer-project UI aliases in package source', () => {
    for (const file of sourceFiles(source).filter(file => /\.tsx?$/.test(file))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"]@\//)
    }
  })

  test('hard-codes no colour: the panels inherit the application\'s tokens', () => {
    const palette = /\b(?:bg|text|border|ring|fill|stroke)-(?:red|green|blue|yellow|orange|purple|pink|gray|slate|zinc|neutral|stone|emerald|sky|indigo|violet|amber|lime|teal|cyan|rose|fuchsia)-\d{2,3}\b|#[0-9a-fA-F]{3,8}\b/
    for (const file of sourceFiles(join(source, 'components')).filter(file => /\.tsx?$/.test(file))) {
      expect([file, palette.test(readFileSync(file, 'utf8'))]).toEqual([file, false])
    }
  })
})
