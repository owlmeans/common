import type { PackageFacts } from '../src/index.js'
import type { RecordedPackage } from './context.js'

/** The clock every spec judges by — the day the public facts below were recorded. */
export const NOW = Date.parse('2026-11-12T12:00:00Z')

const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString()

const facts = (name: string, extra: Partial<PackageFacts> = {}): PackageFacts => ({
  name, installScripts: [], provenance: false, holding: false, unpublished: false, versionCount: 3, maintainerCount: 1,
  created: '2020-01-01T00:00:00.000Z', repository: { url: `git+https://github.com/acme/${name}.git`, web: `https://github.com/acme/${name}` },
  ...extra,
})

const LODASH_REPOSITORY = { url: 'git+https://github.com/lodash/lodash.git', web: 'https://github.com/lodash/lodash' }

/**
 * Registry answers. `lodash`, `loadsh`, `lodas`, `dayjs`, `moment`, `momnet` and `@types/node` are
 * the public npm facts of 2026-11-12 (trimmed); the `acme-*` packages are invented to isolate one rule
 * each.
 */
export const RECORDS: Record<string, RecordedPackage> = {
  lodash: {
    downloads: 199_506_230,
    repository: { name: 'lodash', root: true },
    facts: facts('lodash', {
      description: 'Lodash modular utilities.', latest: '4.18.1', created: '2012-04-23T16:37:11.912Z', versionCount: 117,
      repository: LODASH_REPOSITORY, homepage: 'https://lodash.com/', license: 'MIT', readme: '# lodash',
    }),
  },
  loadsh: {
    downloads: 13_852,
    repository: { name: 'lodash', root: true },
    facts: facts('loadsh', {
      description: 'Lodash modular utilities.', latest: '0.0.4', created: '2018-09-13T06:41:39.649Z', versionCount: 4,
      deprecated: 'This is a typosquat on the popular Lodash package. This is not maintained nor is the original Lodash package.',
      repository: LODASH_REPOSITORY, homepage: 'https://lodash.com/', license: 'MIT', readme: '# lodash v0.0.4',
    }),
  },
  lodas: { downloads: 64, repository: { name: 'lodas', root: false }, facts: facts('lodas', { description: 'A tiny helper set.' }) },
  dayjs: {
    downloads: 107_776_160,
    repository: { name: 'dayjs', root: false },
    facts: facts('dayjs', {
      description: '2KB immutable date time library alternative to Moment.js with the same modern API ', latest: '1.11.23',
      created: '2018-04-10T01:31:28.265Z', versionCount: 136, provenance: true, homepage: 'https://day.js.org', license: 'MIT',
      repository: { url: 'git+https://github.com/iamkun/dayjs.git', web: 'https://github.com/iamkun/dayjs' }, readme: '# Day.js',
    }),
  },
  moment: {
    downloads: 49_425_807,
    facts: facts('moment', { description: 'Parse, validate, manipulate, and display dates', provenance: true, repository: { url: 'github:moment/moment' } }),
  },
  momnet: {
    downloads: 35,
    facts: facts('momnet', {
      description: 'security holding package', latest: '0.0.1-security', created: '2025-01-31T01:14:14.312Z', versionCount: 1,
      maintainerCount: 0, holding: true, repository: { url: 'npm/security-holder' },
    }),
  },
  '@types/node': {
    downloads: 620_333_764,
    facts: facts('@types/node', { description: 'TypeScript definitions for node', provenance: false }),
  },
  '@tyeps/node': { downloads: 3, facts: facts('@tyeps/node', { description: 'TypeScript definitions for node' }) },
  '@acme/lodash': { downloads: 50, facts: facts('@acme/lodash', { description: 'Lodash, rebuilt for acme.', repository: undefined }) },
  'acme-gone': { downloads: null, facts: facts('acme-gone', { unpublished: true, versionCount: 0, repository: undefined }) },
  'acme-color-utilz': {
    downloads: 40,
    repository: { name: 'acme-color-utilz', root: false },
    facts: facts('acme-color-utilz', { created: daysAgo(5), installScripts: ['postinstall'], description: 'Colour helpers' }),
  },
  'acme-fresh-helper': {
    downloads: 12,
    repository: { name: 'acme-fresh-helper', root: false },
    facts: facts('acme-fresh-helper', { created: daysAgo(3), description: 'A fresh helper' }),
  },
  'acme-quick-format': {
    downloads: 2_500,
    repository: { name: 'acme-format-core', root: false },
    facts: facts('acme-quick-format', { description: 'Quick formatting' }),
  },
  'acme-widgets-ui': {
    downloads: 2_500,
    repository: { name: 'acme-monorepo', root: true },
    facts: facts('acme-widgets-ui', { description: 'Widgets' }),
  },
  'acme-popular': {
    downloads: 5_000_000,
    repository: { name: 'acme-something-else', root: false },
    facts: facts('acme-popular', { description: 'Very popular', installScripts: ['install'] }),
  },
}
