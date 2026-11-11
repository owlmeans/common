import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = join(import.meta.dir, '../src')
const build = join(import.meta.dir, '../build')

const filesOf = (dir: string, pattern: RegExp): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)

  return entry.isDirectory() ? filesOf(path, pattern) : pattern.test(entry.name) ? [path] : []
})

describe('@owlmeans/web-upload — package boundary', () => {
  const files = filesOf(source, /\.tsx?$/)

  test('never imports the consumer\'s `@/` alias, in the sources or the emitted modules', () => {
    for (const file of [...files, ...filesOf(build, /\.js$/)]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"]@\//)
    }
  })

  test('never depends on a panel package, never logs through console, never defines theme tokens', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toMatch(/from\s+['"]@owlmeans\/(web|mui|client)-panel/)
      expect(text).not.toMatch(/\bconsole\./)
    }
    for (const file of filesOf(source, /\.css$/).filter(file => !file.endsWith('/@/globals.css'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/:root|\.dark\s*\{/)
    }
  })

  test('never renders a natively disabled control', () => {
    for (const file of files.filter(file => file.endsWith('.tsx') && !file.includes('/@/'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\sdisabled=\{/)
    }
  })
})
