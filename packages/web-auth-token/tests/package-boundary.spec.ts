import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = join(import.meta.dir, '../src')

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)

  return entry.isDirectory() ? sourceFiles(path) : [path]
})

describe('@owlmeans/web-auth-token — package boundary', () => {
  test('does not use consumer-project UI aliases in package source', () => {
    for (const file of sourceFiles(source).filter(file => /\.tsx?$/.test(file))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"]@\//)
    }
  })
})
