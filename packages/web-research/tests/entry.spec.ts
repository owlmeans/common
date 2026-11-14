import { describe, expect, test } from 'bun:test'
import { skillValidator } from '../src/index.js'
import { packageEntryUtils } from '../src/utils/entry.js'

/**
 * How a package is imported, read from its facts: the manifest's entry points and the readme's own
 * import lines — and the skill check built on them. `daydate` is a SYNTHETIC CommonJS date library
 * whose readme, like many, shows only plugin and locale imports; `@acme/widgets` an ESM package with
 * an exports map.
 */
const CJS = { main: 'daydate.min.js', types: 'index.d.ts' }
const ESM = {
  type: 'module', types: './dist/index.d.ts',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.cjs' }, './button': './dist/button.js' },
}
const README = [
  '# daydate', '', '```javascript', "daydate().startOf('month').add(1, 'day').format('YYYY-MM-DD')", '```', '',
  'Plugins: `import advancedFormat from \'daydate/plugin/advancedFormat\' // ES 2015`', '',
  '```js', "import 'daydate/locale/es'", "const daydate = require('daydate');", 'daydate.locale(\'es\')', '```',
  'Unrelated: `import other from \'daydate-extra\'`',
].join('\n')

describe('web-research — package entry points', () => {
  test('a CommonJS manifest: its module system, entry files, and that the root is importable', () => {
    expect(packageEntryUtils.facts('daydate', CJS)).toEqual([
      '- Module system: CommonJS by default (no `"type"` field)', '- main: `daydate.min.js`', '- types: `index.d.ts`',
      '- The package root is importable: `daydate`',
    ])
    expect(packageEntryUtils.hasRoot(CJS)).toBe(true)
    expect(packageEntryUtils.facts('daydate', undefined)).toEqual([])
  })

  test('an ESM exports map: the root entry as JSON and the other subpaths', () => {
    expect(packageEntryUtils.facts('@acme/widgets', ESM)).toEqual([
      '- Module system: ESM (`"type": "module"`)', '- types: `./dist/index.d.ts`',
      '- exports "." (the root): `{"types":"./dist/index.d.ts","import":"./dist/index.js","require":"./dist/index.cjs"}`',
      '- exports subpaths: `./button`', '- The package root is importable: `@acme/widgets`',
    ])
    expect(packageEntryUtils.hasRoot({ exports: { './button': './button.js' } })).toBe(false)
    expect(packageEntryUtils.facts('subonly', { exports: { './button': './button.js' } }).at(-1)).toBe('- Only subpaths of `subonly` are exported; its root is not.')
  })

  test('the readme\'s import lines of THIS package, root imports first, each once', () => {
    expect(packageEntryUtils.readmeImports('daydate', README)).toEqual([
      "const daydate = require('daydate')",
      "import advancedFormat from 'daydate/plugin/advancedFormat' // ES 2015",
      "import 'daydate/locale/es'",
    ])
    expect(packageEntryUtils.readmeImports('daydate', '# daydate\n\nNo code.')).toEqual([])
  })

  test('the notes section: the entry points, then the readme\'s import lines as code', () => {
    const section = packageEntryUtils.section('daydate', CJS, README)
    expect(section).toStartWith('## Entry points (package manifest)\n\n- Module system: CommonJS by default')
    expect(section).toContain("```ts\nconst daydate = require('daydate')\nimport advancedFormat from 'daydate/plugin/advancedFormat' // ES 2015")
    expect(packageEntryUtils.section('daydate', undefined, '# daydate')).toBe('')
  })

  test('root imports and the names they bind', () => {
    expect(packageEntryUtils.importsRoot('daydate', "import daydate from 'daydate'")).toBe(true)
    expect(packageEntryUtils.importsRoot('daydate', 'const d = require("daydate")')).toBe(true)
    expect(packageEntryUtils.importsRoot('daydate', "import advancedFormat from 'daydate/plugin/advancedFormat'")).toBe(false)
    expect(packageEntryUtils.importsRoot('daydate', "import x from 'daydate-extra'")).toBe(false)
    expect(packageEntryUtils.rootBindings('@acme/widgets', "import W, { Button } from '@acme/widgets'\nimport * as all from '@acme/widgets'\nimport type { T } from '@acme/widgets'"))
      .toEqual(['W', 'all'])
  })
})

const skill = (imports: string, recipe: string): string => [
  '---', 'name: pkg-daydate', 'description: "Use when formatting dates with daydate."', '---', '',
  '# daydate — dates',
  '## When to use\n\nDates.', '## Install\n\n```bash\nbun add daydate\n```', `## Imports\n\n${imports}`,
  '## Core API\n\n```ts\ndaydate(date?: string)\n```', `## Recipes\n\n${recipe}`, '## Pitfalls\n\nImmutable.', '## Version notes\n\nMajor 1.',
].join('\n\n')

const ROOT = "Right:\n\n```ts\nimport daydate from 'daydate'\nconst daydate = require('daydate')\n```"
const PLUGIN_ONLY = "```ts\nimport advancedFormat from 'daydate/plugin/advancedFormat'\n```\n\nDo not assume a root-package import form: the notes do not specify one."
const IMPORTED = "```ts\nimport daydate from 'daydate'\n\nexport const nextYear = (at: string): string => daydate(at).add(1, 'year').format('YYYY-MM-DD')\n```"
const INJECTED = "```ts\ntype DateFactory = (date: string) => { format: (pattern: string) => string }\n\nfunction nextYear(daydate: DateFactory, at: string): string {\n  return daydate(at).format('YYYY')\n}\n```"

describe('web-research — the SKILL.md validator, against the package', () => {
  const expect_ = { package: 'daydate', rootImport: true }

  test('a skill opening Imports with the root import and importing it in its recipes passes', () => {
    expect(skillValidator.validate(skill(ROOT, IMPORTED), 'pkg-daydate', expect_)).toMatchObject({ ok: true, errors: [] })
  })

  test('a skill that hedges the root import and passes the package in as a parameter is refused, both faults named', () => {
    const result = skillValidator.validate(skill(PLUGIN_ONLY, INJECTED), 'pkg-daydate', expect_)
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      expect.stringContaining('"## Imports" section shows no import of the package root \'daydate\''),
      expect.stringContaining('takes `daydate` as a function parameter'),
    ])
    // Without a root to show, only the parameter is a fault; without an expectation, neither is checked.
    expect(skillValidator.validate(skill(PLUGIN_ONLY, INJECTED), 'pkg-daydate', { package: 'daydate' }).errors)
      .toEqual([expect.stringContaining('as a function parameter')])
    expect(skillValidator.validate(skill(PLUGIN_ONLY, INJECTED), 'pkg-daydate').ok).toBe(true)
  })

  test('the root import must be IN the Imports section — one in a recipe does not count', () => {
    expect(skillValidator.validate(skill(PLUGIN_ONLY, IMPORTED), 'pkg-daydate', expect_).errors)
      .toEqual([expect.stringContaining('shows no import of the package root')])
  })
})
