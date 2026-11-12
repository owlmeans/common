import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = join(import.meta.dir, '../src')

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)

  return entry.isDirectory() ? sourceFiles(path) : [path]
})

describe('@owlmeans/web-panel — package boundary', () => {
  test('does not use consumer-project UI aliases in package source', () => {
    for (const file of sourceFiles(source).filter(file => /\.tsx?$/.test(file))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"]@\//)
    }
  })

  test('names no captcha provider: the captcha renderer shows a registered client\'s widget', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    const declared = ['dependencies', 'devDependencies', 'peerDependencies'].flatMap(field => Object.keys(manifest[field] ?? {}))

    expect(declared.filter(name => /captcha-|recaptcha/i.test(name))).toEqual([])
    for (const file of sourceFiles(source).filter(file => /\.tsx?$/.test(file))) {
      expect([file, /recaptcha/i.test(readFileSync(file, 'utf8'))]).toEqual([file, false])
    }
  })
})
