import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = join(import.meta.dir, '../src')

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)

  return entry.isDirectory() ? sourceFiles(path) : [path]
})

describe('@owlmeans/web-auth-email — package boundary', () => {
  const files = sourceFiles(source).filter(file => /\.tsx?$/.test(file))

  test('does not use consumer-project UI aliases in package source', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"]@\//)
    }
  })

  test('never depends on a panel package and never logs through console', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toMatch(/from\s+['"]@owlmeans\/(web|mui|client)-panel/)
      expect(text).not.toMatch(/\bconsole\./)
    }
  })

  test('never renders a natively disabled control', () => {
    for (const file of files.filter(file => file.endsWith('.tsx') && !file.includes('/@/'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\sdisabled=\{/)
    }
  })
})
