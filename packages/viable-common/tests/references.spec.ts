import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { DEFAULT_UPLOAD_POLICY, FileKind } from '@owlmeans/upload'
import * as barrel from '../src/index.js'
import {
  MATERIAL_SKILL_NAME_MAX, MATERIALS_DIR, MATERIALS_INDEX_VERSION, MATERIALS_LIMITS, MATERIALS_LINK_LIMITS,
  MATERIALS_LINK_POLICY, MATERIALS_LINKS_PREFIX, MATERIALS_REFERENCE_DIR, MATERIALS_REFERENCES, MATERIALS_REFERENCES_DOC,
  MATERIALS_RESEARCH_DIR, MATERIALS_RESEARCH_PURPOSE, MATERIALS_SCOPE_PURPOSE, MATERIALS_SKILL_PREFIX, MATERIALS_SKILLS_DIR,
  MaterialGeneratedDocSchema, MaterialGeneratedKind, MaterialLinkDetailsSchema, MaterialLinkIntent, MaterialStatus,
  REFERENCE_CUE_LANGUAGES, REFERENCE_RESEARCH_CUES, REFERENCES_VERSION, ReferenceLinkStatus, ReferenceOrigin,
  ReferencePackageStatus, ReferencePackageVerdict, ReferenceResearchStatus, ReferencesLedgerSchema, materialIndexHelper,
  materialLinkOf, materialPathHelper, referenceScanHelper, referencesLedgerHelper,
} from '../src/materials/index.js'
import type {
  MaterialGeneratedDoc, MaterialIndexEntry, ReferenceLink, ReferencesLedger,
} from '../src/materials/index.js'
import { ModelRole } from '../src/execution/consts.js'
import { MODEL_TIER_ROLES, ModelTier } from '../src/connect/consts.js'
import { ConversionEstimateSchema } from '../src/convert/schemas.js'
import { SLOT_BINARY_MAX_BYTES } from '../src/slot/consts.js'

const MiB = 1024 * 1024
const ajv = new Ajv({ allErrors: true, strict: false })

const link = (patch: Partial<ReferenceLink> = {}): ReferenceLink => ({
  id: referencesLedgerHelper.linkIdOf('https://twenty.com'),
  url: 'https://twenty.com',
  normalized: 'https://twenty.com/',
  intents: [MaterialLinkIntent.Function],
  own: false,
  instruction: 'By functionality it should work like https://twenty.com',
  origin: ReferenceOrigin.Prompt,
  status: ReferenceLinkStatus.Researched,
  docs: [materialPathHelper.summaryDocOf('twenty-com')],
  ...patch,
})

const drive = link({
  id: referencesLedgerHelper.linkIdOf('https://drive.google.com/drive/folders/1AbC'),
  url: 'https://drive.google.com/drive/folders/1AbC',
  normalized: 'https://drive.google.com/drive/folders/1AbC',
  intents: [MaterialLinkIntent.Design, MaterialLinkIntent.Asset, MaterialLinkIntent.Content],
  own: true,
  instruction: undefined,
  status: ReferenceLinkStatus.Fetched,
  folder: materialPathHelper.folderOf(1, 'drive.google.com/drive/folders/1AbC'),
  files: 3,
  bytes: 48_000,
  docs: undefined,
})

const ledger = (): ReferencesLedger => referencesLedgerHelper.merge(referencesLedgerHelper.empty(), {
  links: [drive, link()],
  research: [{
    id: referencesLedgerHelper.researchIdOf('lead scoring best practices in B2B CRMs'),
    query: 'lead scoring best practices in B2B CRMs',
    instruction: 'Search online for current best practices of lead scoring in B2B CRMs and apply them.',
    origin: ReferenceOrigin.Prompt,
    status: ReferenceResearchStatus.Researched,
    doc: materialPathHelper.researchDocOf('lead-scoring'),
    sources: 5,
  }],
  packages: [
    { name: 'dayjs', origin: ReferenceOrigin.Prompt, verdict: ReferencePackageVerdict.Genuine, skill: 'dayjs', status: ReferencePackageStatus.Skilled },
    {
      name: 'loadsh', origin: ReferenceOrigin.Prompt, verdict: ReferencePackageVerdict.Suspicious,
      reasons: ['an edit away from a far more popular package'], lookalikeOf: 'lodash', status: ReferencePackageStatus.Refused,
      reason: 'looks like lodash',
    },
  ],
  updatedAt: '2026-11-12T10:00:00.000Z',
})

describe('viable-common — references vocabulary', () => {
  test('intents, origins and statuses keep their wire values', () => {
    expect(Object.values(MaterialLinkIntent)).toEqual(['design', 'function', 'content', 'asset', 'package'])
    expect(Object.values(ReferenceOrigin)).toEqual(['prompt', 'specification', 'link'])
    expect(Object.values(ReferenceLinkStatus)).toEqual(['pending', 'fetched', 'researched', 'skipped', 'refused', 'failed'])
    expect(Object.values(ReferenceResearchStatus)).toEqual(['pending', 'researched', 'skipped', 'failed'])
    expect(Object.values(ReferencePackageVerdict)).toEqual(['genuine', 'suspicious', 'unknown'])
    expect(Object.values(ReferencePackageStatus)).toEqual(['pending', 'verified', 'refused', 'skilled', 'failed'])
    expect(Object.values(MaterialGeneratedKind)).toEqual(['research', 'reference-summary', 'reference-design', 'skill'])
  })

  test('the link budget, and its policy mirrors the upload one with the link file limits', () => {
    expect(MATERIALS_LINK_LIMITS).toEqual({
      links: 10, files: 100, fileBytes: 12 * MiB, totalBytes: 100 * MiB, research: 3, researchResults: 5, skills: 5,
    })
    expect(Object.isFrozen(MATERIALS_LINK_LIMITS)).toBe(true)
    // One file ceiling across the stack: a fetched file fits the binary transport exactly, like an upload.
    expect(MATERIALS_LINK_LIMITS.fileBytes).toBe(SLOT_BINARY_MAX_BYTES)
    expect(MATERIALS_LINK_LIMITS.fileBytes).toBe(MATERIALS_LIMITS.fileBytes)
    expect(MATERIALS_LINK_POLICY).toEqual({
      ...DEFAULT_UPLOAD_POLICY, maxFiles: 100, maxFileBytes: 12 * MiB, maxTotalBytes: 100 * MiB, unpackArchives: true,
      refuse: [FileKind.Executable],
    })
    expect(Object.isFrozen(MATERIALS_LINK_POLICY)).toBe(true)
  })

  test('the reserved prefix, the research scope purpose and the generated-document locations', () => {
    expect(MATERIALS_LINKS_PREFIX).toBe('links')
    expect(MATERIALS_RESEARCH_PURPOSE).toBe('research')
    // Within one organization and slot a purpose never equals another purpose.
    expect(MATERIALS_RESEARCH_PURPOSE).not.toBe(MATERIALS_SCOPE_PURPOSE)
    expect([MATERIALS_REFERENCES_DOC, MATERIALS_REFERENCES]).toEqual(['references.json', 'docs/materials/references.json'])
    expect([MATERIALS_RESEARCH_DIR, MATERIALS_REFERENCE_DIR, MATERIALS_SKILLS_DIR, MATERIALS_SKILL_PREFIX])
      .toEqual(['research', 'references', 'skills', 'pkg-'])
    expect(REFERENCES_VERSION).toBe(1)
    expect(MATERIALS_INDEX_VERSION).toBe(1)
  })

  test('the barrel carries the references module', () => {
    expect(barrel.referenceScanHelper).toBe(referenceScanHelper)
    expect(barrel.referencesLedgerHelper).toBe(referencesLedgerHelper)
    expect(barrel.materialPathHelper).toBe(materialPathHelper)
    expect(barrel.materialLinkOf).toBe(materialLinkOf)
    expect(barrel.MATERIALS_LINK_LIMITS).toBe(MATERIALS_LINK_LIMITS)
    expect(barrel.ReferencesLedgerSchema).toBe(ReferencesLedgerSchema)
  })
})

describe('viable-common — reference paths and names', () => {
  test('the links prefix is reserved, alone and with docs/materials for an upload', () => {
    for (const path of ['links', 'links/01-twenty-com/index.html', 'LINKS/a.png', './links/a.png']) {
      expect([path, materialPathHelper.isLinkPath(path)]).toEqual([path, true])
      expect([path, materialPathHelper.isReservedPath(path)]).toEqual([path, true])
    }
    for (const path of ['linksy/a.png', 'brand/links/a.png', 'link.png', 'docs/materials-old/a.md']) {
      expect([path, materialPathHelper.isReservedPath(path)]).toEqual([path, false])
    }
    expect(materialPathHelper.isReservedPath(`${MATERIALS_DIR}/index.md`)).toBe(true)
    expect(materialPathHelper.isReservedPath('Docs/Materials')).toBe(true)
    expect(materialPathHelper.isLinkPath(`${MATERIALS_DIR}/index.md`)).toBe(false)
  })

  test('a link folder: the ordinal, two digits at least, and a safe slug', () => {
    expect(materialPathHelper.folderNameOf(3, 'https://www.Twenty.com/')).toBe('03-twenty-com')
    expect(materialPathHelper.folderOf(1, 'https://drive.google.com/drive/folders/1AbC')).toBe('links/01-drive-google-com-drive-folders-1abc')
    expect(materialPathHelper.folderNameOf(12, 'Ünïcode Название ../../etc')).toBe('12-unicode-etc')
    expect(materialPathHelper.folderNameOf(-1.7, '')).toBe('00-link')
    const long = materialPathHelper.folderNameOf(10, `https://example.com/${'segment-'.repeat(40)}`)
    expect(long.length).toBeLessThanOrEqual(3 + 48)
    expect(long).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
    expect(materialPathHelper.slugOf('twenty-com')).toBe('twenty-com')
  })

  test('a package skill name: scope folded in, safe, idempotent, short enough for the prefix', () => {
    expect(materialPathHelper.skillNameOf('@tanstack/react-query')).toBe('tanstack-react-query')
    expect(materialPathHelper.skillNameOf('dayjs')).toBe('dayjs')
    expect(materialPathHelper.skillNameOf('lodash.debounce')).toBe('lodash-debounce')
    expect(materialPathHelper.skillNameOf('__My_Pkg__')).toBe('my-pkg')
    expect(materialPathHelper.skillNameOf('tanstack-react-query')).toBe('tanstack-react-query')
    expect(materialPathHelper.skillNameOf('@/')).toBeNull()
    const long = materialPathHelper.skillNameOf(`@scope/${'a'.repeat(80)}`)!
    expect(`${MATERIALS_SKILL_PREFIX}${long}`.length).toBe(MATERIAL_SKILL_NAME_MAX)
  })

  test('where generated documents and workload skills go', () => {
    expect(materialPathHelper.researchDocOf('Lead scoring')).toBe('docs/materials/research/lead-scoring.md')
    expect(materialPathHelper.summaryDocOf('twenty-com')).toBe('docs/materials/references/twenty-com/summary.md')
    expect(materialPathHelper.designDocOf('https://stripe.com')).toBe('docs/materials/references/stripe-com/design.md')
    expect(materialPathHelper.skillDocOf('@tanstack/react-query')).toBe('docs/materials/skills/tanstack-react-query/SKILL.md')
    expect(materialPathHelper.skillDirOf('dayjs')).toBe('.agents/skills/pkg-dayjs')
  })
})

describe('viable-common — the references ledger', () => {
  const validate = ajv.compile(ReferencesLedgerSchema)

  test('a full ledger, an empty one and `null` optionals pass the schema', () => {
    expect(validate(ledger())).toBe(true)
    expect(validate(referencesLedgerHelper.empty())).toBe(true)
    expect(validate({ ...referencesLedgerHelper.empty(), links: [{ ...link(), reason: null, folder: null }] })).toBe(true)
    expect(validate({ ...referencesLedgerHelper.empty(), packages: [{ name: 'x', origin: 'link', status: 'pending', verdict: null }] }))
      .toBe(true)
  })

  test('a stray key, an unknown status or intent and a link from a link are refused', () => {
    expect(validate({ ...ledger(), extra: true })).toBe(false)
    expect(validate({ ...referencesLedgerHelper.empty(), links: [link({ status: 'lost' as ReferenceLinkStatus })] })).toBe(false)
    expect(validate({ ...referencesLedgerHelper.empty(), links: [link({ intents: ['look' as MaterialLinkIntent] })] })).toBe(false)
    expect(validate({ ...referencesLedgerHelper.empty(), links: [link({ origin: ReferenceOrigin.Link as ReferenceOrigin.Prompt })] }))
      .toBe(false)
    expect(validate({ ...referencesLedgerHelper.empty(), links: [link({ intents: [MaterialLinkIntent.Design, MaterialLinkIntent.Design] })] }))
      .toBe(false)
    expect(JSON.stringify(ReferencesLedgerSchema)).not.toContain('"integer"')
  })

  test('render is deterministic JSON and parses back to the same bytes', () => {
    const text = referencesLedgerHelper.render(ledger())
    expect(text.startsWith('{\n  "version": 1,\n  "links": [\n    {\n      "id": ')).toBe(true)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).not.toContain('"instruction": null')
    const parsed = referencesLedgerHelper.parse(text)
    expect(parsed).toEqual(JSON.parse(text))
    expect(referencesLedgerHelper.render(parsed)).toBe(text)
    // Rows keep ledger order: a link's place is its ordinal.
    expect(parsed.links.map(one => one.url)).toEqual([drive.url, link().url])
  })

  test('parse is total: bad JSON, broken rows and mistyped optionals give less, never a throw', () => {
    expect(referencesLedgerHelper.parse('')).toEqual(referencesLedgerHelper.empty())
    expect(referencesLedgerHelper.parse('[1,2]')).toEqual(referencesLedgerHelper.empty())
    expect(referencesLedgerHelper.parse('{ nope')).toEqual(referencesLedgerHelper.empty())
    const parsed = referencesLedgerHelper.parse(JSON.stringify({
      version: 7,
      links: [{ id: 'a' }, { ...link(), files: -1, docs: 'x', secret: 's', intents: ['design', 'design'] }],
      research: [{ id: 'r', query: 'q', origin: 'link', status: 'pending' }],
      packages: [{ name: 'dayjs', origin: 'prompt', status: 'pending', verdict: 'maybe', reasons: ['a', 3] }],
      updatedAt: 5,
    }))
    expect(parsed.version).toBe(REFERENCES_VERSION)
    expect(parsed.links).toHaveLength(1)
    expect(parsed.links[0]).not.toHaveProperty('files')
    expect(parsed.links[0]).not.toHaveProperty('docs')
    expect(parsed.links[0]).not.toHaveProperty('secret')
    expect(parsed.links[0]?.intents).toEqual([MaterialLinkIntent.Design])
    expect(parsed.research).toEqual([])
    expect(parsed.packages).toEqual([{ name: 'dayjs', origin: ReferenceOrigin.Prompt, status: ReferencePackageStatus.Pending }])
    expect(parsed).not.toHaveProperty('updatedAt')
    expect(validate(parsed)).toBe(true)
  })

  test('ids are stable digests: one per normalized URL, one per folded query', () => {
    expect(referencesLedgerHelper.linkIdOf('https://twenty.com')).toMatch(/^[0-9a-f]{16}$/)
    expect(referencesLedgerHelper.linkIdOf('HTTPS://Twenty.com/#pricing')).toBe(referencesLedgerHelper.linkIdOf('https://twenty.com'))
    expect(referencesLedgerHelper.linkIdOf('https://twenty.com/a')).not.toBe(referencesLedgerHelper.linkIdOf('https://twenty.com/A'))
    expect(referencesLedgerHelper.researchIdOf('  Lead   Scoring ')).toBe(referencesLedgerHelper.researchIdOf('lead scoring'))
  })

  test('find and merge by id or name: a known row keeps its place, a new one is appended', () => {
    const before = ledger()
    const after = referencesLedgerHelper.merge(before, {
      links: [
        { ...link(), status: ReferenceLinkStatus.Failed, reason: 'timed out', docs: undefined },
        link({ id: 'new', url: 'https://example.com', normalized: 'https://example.com/', status: ReferenceLinkStatus.Pending, docs: undefined }),
      ],
      packages: [{ name: 'dayjs', origin: ReferenceOrigin.Prompt, status: ReferencePackageStatus.Verified }],
      updatedAt: '2026-11-12T11:00:00.000Z',
    })
    expect(after.links.map(one => one.id)).toEqual([drive.id, link().id, 'new'])
    expect(referencesLedgerHelper.findLink(after, link().id)).toMatchObject({ status: 'failed', reason: 'timed out' })
    // An explicit undefined clears; a key left out keeps its value.
    expect(referencesLedgerHelper.render(after)).not.toContain('summary.md')
    expect(referencesLedgerHelper.findPackage(after, 'dayjs')).toMatchObject({ skill: 'dayjs', status: 'verified' })
    expect(referencesLedgerHelper.findResearch(after, before.research[0]!.id)?.doc).toBe(before.research[0]!.doc)
    expect(after.updatedAt).toBe('2026-11-12T11:00:00.000Z')
    // The ledger it was given is untouched.
    expect(referencesLedgerHelper.render(before)).toBe(referencesLedgerHelper.render(ledger()))
    expect(referencesLedgerHelper.findLink(after, 'missing')).toBeUndefined()
  })

  test('usage and remaining budget against the link limits', () => {
    const used = referencesLedgerHelper.usage(ledger())
    expect(used).toEqual({ links: 2, files: 3, bytes: 48_000, research: 1, skills: 1 })
    expect(referencesLedgerHelper.remaining(ledger())).toEqual({
      links: 8, files: 97, bytes: 100 * MiB - 48_000, research: 2, skills: 4,
    })
    // Skipped, refused and failed links take no link; the stored rows replace the ledger's counts.
    const crowded = referencesLedgerHelper.merge(ledger(), {
      links: Array.from({ length: 12 }, (_, at) => link({
        id: `l${at}`, status: at < 9 ? ReferenceLinkStatus.Fetched : ReferenceLinkStatus.Skipped, files: 20, bytes: 20 * MiB,
      })),
    })
    expect(referencesLedgerHelper.usage(crowded).links).toBe(2 + 9)
    expect(referencesLedgerHelper.remaining(crowded)).toMatchObject({ links: 0, files: 0, bytes: 0 })
    expect(referencesLedgerHelper.remaining(ledger(), { files: 10, bytes: MiB })).toMatchObject({ files: 90, bytes: 99 * MiB })
  })
})

describe('viable-common — fetched-file provenance', () => {
  const validate = ajv.compile(MaterialLinkDetailsSchema)
  const details = { url: 'https://fonts.gstatic.com/s/inter.woff2', linkId: drive.id, intent: MaterialLinkIntent.Design, own: true, completes: 'links/01-drive/index.html' }
  const entry = (link: unknown): MaterialIndexEntry => ({
    path: 'links/01-drive/fonts/inter.woff2', name: 'inter.woff2', size: 10, status: MaterialStatus.Received,
    details: { link } as MaterialIndexEntry['details'],
  })

  test('the details schema: required provenance, `null` optionals, no stray key', () => {
    expect(validate(details)).toBe(true)
    expect(validate({ ...details, primaryDesign: null, completes: null })).toBe(true)
    expect(validate({ url: details.url, linkId: details.linkId, intent: 'design' })).toBe(false)
    expect(validate({ ...details, intent: 'look' })).toBe(false)
    expect(validate({ ...details, extra: 1 })).toBe(false)
  })

  test('materialLinkOf reads details.link of an entry, and nothing from an upload or a broken link', () => {
    expect(materialLinkOf(entry(details))).toEqual(details)
    expect(materialLinkOf(entry({ ...details, primaryDesign: 'yes', other: 1 }))).toEqual(details)
    expect(materialLinkOf({ path: 'a.png', name: 'a.png', size: 1, status: MaterialStatus.Received })).toBeUndefined()
    expect(materialLinkOf(entry({ ...details, own: 'true' }))).toBeUndefined()
    expect(materialLinkOf(entry({ ...details, intent: 'look' }))).toBeUndefined()
    expect(materialLinkOf(entry('https://x'))).toBeUndefined()
  })

  test('provenance survives the index document', () => {
    const doc = materialIndexHelper.render([entry(details)])
    expect(materialLinkOf(materialIndexHelper.parse(doc)[0]!)).toEqual(details)
  })
})

describe('viable-common — the reference scan', () => {
  test('URLs in prose: trailing punctuation, quotes and unbalanced brackets stripped', () => {
    expect(referenceScanHelper.urls(
      'Like https://twenty.com. Our files: https://drive.google.com/drive/folders/1AbC?usp=sharing, '
      + 'see (https://en.wikipedia.org/wiki/Lead_(sales)) and «https://example.org/ru»; "https://y.net/q?z=1"!',
    )).toEqual([
      'https://twenty.com/', 'https://drive.google.com/drive/folders/1AbC?usp=sharing',
      'https://en.wikipedia.org/wiki/Lead_(sales)', 'https://example.org/ru', 'https://y.net/q?z=1',
    ])
  })

  test('markdown links and autolinks, deduplicated in order of appearance', () => {
    expect(referenceScanHelper.urls(
      '[https://a.com](https://a.com) then [docs](https://b.com/docs#intro), <https://c.com/x>, **https://a.com/**',
    )).toEqual(['https://a.com/', 'https://b.com/docs', 'https://c.com/x'])
  })

  test('s3:// objects and prefixes, other schemes ignored, over-long ones dropped', () => {
    expect(referenceScanHelper.urls('Pricing: s3://Crmore-Test/pricing/crmore-pricing.md and s3://bucket/prefix/ '
      + 'not ftp://x.com nor mailto:a@b.c')).toEqual(['s3://crmore-test/pricing/crmore-pricing.md', 's3://bucket/prefix/'])
    expect(referenceScanHelper.urls(`https://x.com/${'a'.repeat(2100)}`)).toEqual([])
  })

  test('normalize: case of scheme and host, default port, fragment, credentials and an empty query dropped', () => {
    expect(referenceScanHelper.normalize('HTTPS://user:pw@Example.COM:443/Path?Q=1#frag')).toBe('https://example.com/Path?Q=1')
    expect(referenceScanHelper.normalize('https://example.com/?')).toBe('https://example.com/')
    expect(referenceScanHelper.normalize('http://example.com:8080')).toBe('http://example.com:8080/')
    expect(referenceScanHelper.normalize('javascript:alert(1)')).toBeNull()
    expect(referenceScanHelper.normalize('not a url')).toBeNull()
  })

  test('scan: links and the research cue together; none in a plain prompt', () => {
    expect(referenceScanHelper.scan(
      'Build the web app for Crmore. Our files are here: https://drive.google.com/drive/folders/1AbC — make it work like '
      + 'https://twenty.com. Search online for current best practices of lead scoring in B2B CRMs and apply them.',
    )).toEqual({ links: ['https://drive.google.com/drive/folders/1AbC', 'https://twenty.com/'], research: true })
    expect(referenceScanHelper.scan('A todo app with reminders.')).toEqual({ links: [], research: false })
  })

  const cues: Record<string, { yes: string[], no: string[] }> = {
    en: {
      yes: [
        'Search online for current best practices of lead scoring.', 'Please look it up on the internet first.',
        'Research what similar apps offer.', 'Find out online which payment providers are popular.',
        'Google it before you decide.', 'Check competitors like HubSpot and Pipedrive.', 'Browse the web for examples.',
        'Search the web for typical pricing.', 'Look up the latest regulations.', 'SEARCH THE INTERNET for ideas.',
      ],
      no: [
        'Build a todo app with user accounts and reminders.', 'A landing page for my bakery with a contact form.',
        'Users sign in with Google and see a dashboard.', 'Add a lookup table and a browser extension.',
        'Make it look like https://research.example.com/web/online',
      ],
    },
    ru: {
      yes: [
        'Найди в интернете лучшие практики скоринга лидов.', 'Поищи, как это делают другие.', 'Исследуй рынок CRM.',
        'Изучи в сети отзывы клиентов.', 'Загугли примеры лендингов.', 'Проанализируй конкурентов.',
        'Посмотри в интернете актуальные цены.', 'НАЙДИТЕ В ИНТЕРНЕТЕ примеры.', 'Наиди в интернете примеры.',
      ],
      no: ['Сделай приложение для учёта задач с личным кабинетом.', 'Интернет-магазин цветов с корзиной и оплатой.'],
    },
    uk: {
      yes: [
        'Знайди в інтернеті найкращі практики.', 'Пошукай приклади.', 'Досліди ринок CRM.', 'Вивчи конкурентів.',
        'Погугли, як це працює.', 'Подивись у мережі відгуки.',
      ],
      no: ['Зроби застосунок для обліку завдань з особистим кабінетом.'],
    },
    be: {
      yes: [
        'Знайдзі ў інтэрнэце лепшыя практыкі.', 'Пашукай прыклады.', 'Даследуй рынак CRM.', 'Вывучы канкурэнтаў.',
        'Пагуглі, як гэта працуе.', 'Паглядзі ў сеціве водгукі.',
      ],
      no: ['Зрабі праграму для ўліку задач з асабістым кабінетам.'],
    },
    pl: {
      yes: [
        'Wyszukaj w internecie najlepsze praktyki.', 'Poszukaj przykładów.', 'Sprawdź w sieci opinie.',
        'Przeanalizuj konkurencję.', 'Zbadaj rynek CRM.', 'Sprawdz w sieci opinie.',
      ],
      no: ['Zbuduj aplikację do zarządzania zadaniami z kontem użytkownika.'],
    },
    de: {
      yes: [
        'Recherchiere aktuelle Best Practices.', 'Suche im Internet nach Beispielen.', 'Schau online nach Preisen.',
        'Analysiere die Konkurrenz.', 'Finde heraus, was Kunden wollen.', 'Prüfe die Wettbewerber.',
      ],
      no: ['Baue eine Aufgaben-App mit Benutzerkonten und Erinnerungen.', 'Eine Webseite für meine Bäckerei mit Kontaktformular.'],
    },
    es: {
      yes: [
        'Busca en internet las mejores prácticas.', 'Investiga el mercado.', 'Averigua qué ofrecen otros.',
        'Analiza la competencia.', 'Búscalo en Google.', 'Busca en linea ejemplos.',
      ],
      no: ['Crea una aplicación de tareas con cuentas de usuario.'],
    },
    fr: {
      yes: [
        'Recherche sur internet les meilleures pratiques.', 'Cherche en ligne des exemples.', 'Renseigne-toi sur les tarifs.',
        'Analyse la concurrence.', 'Trouve sur le web des idées.', 'Étudie le marché.',
      ],
      no: ['Crée une application de tâches avec des comptes utilisateurs.'],
    },
  }

  test('the cue lexicon covers the manager\'s eight languages', () => {
    expect([...REFERENCE_CUE_LANGUAGES].sort()).toEqual(['be', 'de', 'en', 'es', 'fr', 'pl', 'ru', 'uk'])
    expect(Object.keys(REFERENCE_RESEARCH_CUES).sort()).toEqual([...REFERENCE_CUE_LANGUAGES].sort())
    expect(Object.keys(cues).sort()).toEqual([...REFERENCE_CUE_LANGUAGES].sort())
  })

  for (const language of REFERENCE_CUE_LANGUAGES) {
    test(`research cues in ${language}: every phrasing found, a plain prompt not`, () => {
      for (const text of cues[language]!.yes) expect([text, referenceScanHelper.research(text)]).toEqual([text, true])
      for (const text of cues[language]!.no) expect([text, referenceScanHelper.research(text)]).toEqual([text, false])
    })
  }
})

describe('viable-common — the researcher role', () => {
  test('a role of its own, with a power class and in every closed role enumeration', () => {
    expect(ModelRole.Researcher).toBe('researcher' as ModelRole)
    expect(MODEL_TIER_ROLES[ModelRole.Researcher]).toBe(ModelTier.Standard)
    const roles = (ConversionEstimateSchema as any).properties.roles.items.properties.role.enum as string[]
    expect(roles).toContain(ModelRole.Researcher)
    expect(roles).toEqual(Object.values(ModelRole))
  })
})

describe('viable-common — generated documents in the materials index', () => {
  const entries: MaterialIndexEntry[] = [
    { path: 'a.txt', name: 'a.txt', size: 1, status: MaterialStatus.Received },
  ]
  const generated: MaterialGeneratedDoc[] = [
    { path: materialPathHelper.skillDocOf('dayjs'), title: 'dayjs', kind: MaterialGeneratedKind.Skill },
    { path: materialPathHelper.researchDocOf('lead-scoring'), title: 'Lead scoring | B2B', kind: MaterialGeneratedKind.Research },
    { path: materialPathHelper.summaryDocOf('twenty-com'), title: 'Twenty', kind: MaterialGeneratedKind.ReferenceSummary },
  ]

  test('without the section the bytes are exactly today\'s', () => {
    const today = '---\n{\n  "version": 1,\n  "entries": [\n    {\n      "path": "a.txt",\n      "name": "a.txt",\n      "size": 1,\n'
      + '      "status": "received"\n    }\n  ]\n}\n---\n\n# Project materials\n\nFiles attached to the project when it was created, '
      + 'catalogued by purpose. The JSON block above is the machine copy of this table.\n\n'
      + '| File | Purpose | Type | Size | Status | Uses | Description |\n| --- | --- | --- | --- | --- | --- | --- |\n'
      + '| `a.txt` |  |  | 1 B | received |  |  |\n'
    expect(materialIndexHelper.render(entries)).toBe(today)
    expect(materialIndexHelper.render(entries, [])).toBe(today)
    expect(materialIndexHelper.parseGenerated(today)).toEqual([])
  })

  test('with it: a frontmatter list and a table, sorted by path, and a round trip', () => {
    const doc = materialIndexHelper.render(entries, generated)
    expect(doc).toContain('## Generated documents')
    expect(doc).toContain('| `docs/materials/research/lead-scoring.md` | research | Lead scoring \\| B2B |')
    expect(materialIndexHelper.parse(doc)).toEqual(entries)
    const listed = materialIndexHelper.parseGenerated(doc)
    expect(listed.map(one => one.path)).toEqual([
      'docs/materials/references/twenty-com/summary.md', 'docs/materials/research/lead-scoring.md',
      'docs/materials/skills/dayjs/SKILL.md',
    ])
    expect(materialIndexHelper.render(materialIndexHelper.parse(doc), listed)).toBe(doc)
    expect(materialIndexHelper.render(entries, [...generated].reverse())).toBe(doc)
    const validate = ajv.compile(MaterialGeneratedDocSchema)
    for (const one of listed) expect(validate(one)).toBe(true)
  })

  test('parseGenerated is total: broken items dropped, a missing title read as the path, one per path', () => {
    const doc = '---\n' + JSON.stringify({
      version: 1, entries: [], generated: [
        { path: 'docs/materials/research/a.md', kind: 'research' }, { path: '', kind: 'skill', title: 'x' },
        { path: 'docs/materials/x.md', kind: 'poem', title: 'x' }, 'nope',
        { path: 'docs/materials/research/a.md', kind: 'skill', title: 'dup' },
      ],
    }) + '\n---\n'
    expect(materialIndexHelper.parseGenerated(doc)).toEqual([
      { path: 'docs/materials/research/a.md', title: 'docs/materials/research/a.md', kind: MaterialGeneratedKind.Research },
    ])
    expect(materialIndexHelper.parseGenerated('---\n{ broken\n---\n')).toEqual([])
    expect(materialIndexHelper.parseGenerated('---\n{"generated":"x"}\n---\n')).toEqual([])
  })
})
