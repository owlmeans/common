import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import * as barrel from '../src/index.js'
import {
  MATERIAL_PLATFORM_KEYS, MATERIAL_USABLE_STATUSES, MATERIALS_ASSET_PURPOSES, MATERIALS_ASSETS_DIR, MATERIALS_BRIEF_TOKENS, MATERIALS_DIR,
  MATERIALS_INDEX, MATERIALS_INDEX_VERSION, MATERIALS_KEEP, MATERIALS_LIMITS, MaterialIndexEntrySchema,
  MaterialPurpose, MaterialRemoval, MaterialStatus, MaterialUseBy, MaterialUseTarget, ProjectMaterialRecordSchema,
  materialIndexHelper,
} from '../src/materials/index.js'
import type { MaterialIndexEntry, ProjectMaterialRecord } from '../src/materials/index.js'
import {
  FILE_COMMAND_DEADLINES, SLOT_BINARY_MAX_BASE64_CHARS, SLOT_BINARY_MAX_BYTES, SlotCommandPayloadSchema,
  SlotCommandType, SlotFileCommand, slotCommandHelper,
} from '../src/slot/index.js'

const MiB = 1024 * 1024

const record = (patch: Partial<ProjectMaterialRecord> = {}): ProjectMaterialRecord => ({
  id: 'mat-1',
  projectId: 'project-1',
  entityId: 'entity-1',
  slotId: 'slot-1',
  scope: 'acme/slot-1/new-project',
  path: 'brand/logo.svg',
  name: 'logo.svg',
  size: 3277,
  mime: 'image/svg+xml',
  kind: 'image',
  status: MaterialStatus.Placed,
  purpose: MaterialPurpose.BrandLogo,
  description: 'The company logo | wordmark\non white.',
  details: { width: 512, height: 128, palette: ['#112233'] },
  uses: [{ target: MaterialUseTarget.Logo, by: MaterialUseBy.Name }],
  placedAt: `${MATERIALS_ASSETS_DIR}/brand/logo.svg`,
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T11:00:00.000Z'),
  ...patch,
})

const spec: ProjectMaterialRecord = record({
  path: 'docs/Product Spec.pdf', name: 'Product Spec.pdf', size: 2 * MiB, mime: 'application/pdf',
  kind: 'pdf', status: MaterialStatus.Catalogued, purpose: MaterialPurpose.Specification,
  description: 'What the product does.', details: { pages: 12, language: 'en' }, uses: undefined,
  placedAt: undefined, transcript: `${MATERIALS_DIR}/docs/Product Spec.pdf.md`,
})

const dropped: ProjectMaterialRecord = record({
  path: 'tools/setup.exe', name: 'setup.exe', size: 1024, mime: 'application/x-msdownload', kind: 'executable',
  status: MaterialStatus.Removed, reason: MaterialRemoval.Executable, purpose: undefined, description: undefined,
  details: undefined, uses: undefined, placedAt: undefined,
})

describe('viable-common — materials vocabulary', () => {
  test('the closed sets keep their wire values', () => {
    expect(Object.values(MaterialPurpose)).toEqual([
      'specification', 'brand-logo', 'icon', 'font', 'css-example', 'layout-sketch', 'html-prototype',
      'algorithm-example', 'graphic-asset', 'video-asset', 'audio-asset', 'model-3d', 'notes', 'other',
    ])
    expect(Object.values(MaterialStatus)).toEqual(['received', 'catalogued', 'removed', 'rejected', 'placed'])
    expect(Object.values(MaterialRemoval)).toEqual([
      'type-mismatch', 'dangerous', 'executable', 'prompt-injection', 'limit', 'archive-invalid', 'path-invalid',
    ])
    expect(Object.values(MaterialUseBy)).toEqual(['name', 'reference', 'analysis'])
    expect(MATERIAL_USABLE_STATUSES).toEqual([MaterialStatus.Received, MaterialStatus.Catalogued, MaterialStatus.Placed])
  })

  test('paths, keep list, limits and the brief budget', () => {
    expect(MATERIALS_DIR).toBe('docs/materials')
    expect(MATERIALS_INDEX).toBe('docs/materials/index.md')
    expect(MATERIALS_ASSETS_DIR).toBe('sources/web/public/assets')
    expect(MATERIALS_KEEP).toEqual([MATERIALS_DIR, MATERIALS_ASSETS_DIR])
    expect(MATERIALS_LIMITS).toEqual({ files: 50, fileBytes: 12 * MiB, totalBytes: 50 * MiB })
    expect(Object.isFrozen(MATERIALS_LIMITS)).toBe(true)
    expect(MATERIALS_BRIEF_TOKENS).toBe(80_000)
    expect(MATERIALS_INDEX_VERSION).toBe(1)
  })

  test('the web-asset purposes: what is placed under the public assets folder, every other one under docs/materials', () => {
    expect([...MATERIALS_ASSET_PURPOSES].sort()).toEqual([
      MaterialPurpose.AudioAsset, MaterialPurpose.BrandLogo, MaterialPurpose.Font, MaterialPurpose.GraphicAsset,
      MaterialPurpose.Icon, MaterialPurpose.Model3d, MaterialPurpose.VideoAsset,
    ].sort())
    for (const purpose of [MaterialPurpose.Specification, MaterialPurpose.HtmlPrototype, MaterialPurpose.CssExample, MaterialPurpose.Notes, MaterialPurpose.Other]) {
      expect(MATERIALS_ASSET_PURPOSES.has(purpose)).toBe(false)
    }
    expect(barrel.MATERIALS_ASSET_PURPOSES).toBe(MATERIALS_ASSET_PURPOSES)
  })

  test('one file ceiling across the stack: a material fits the binary transport exactly', () => {
    expect(MATERIALS_LIMITS.fileBytes).toBe(SLOT_BINARY_MAX_BYTES)
    expect(SLOT_BINARY_MAX_BASE64_CHARS).toBe(Math.ceil(SLOT_BINARY_MAX_BYTES / 3) * 4)
  })

  test('the barrel carries the materials module', () => {
    expect(barrel.materialIndexHelper).toBe(materialIndexHelper)
    expect(barrel.MATERIALS_KEEP).toBe(MATERIALS_KEEP)
    expect(barrel.ProjectMaterialRecordSchema).toBe(ProjectMaterialRecordSchema)
  })
})

describe('viable-common — materials schemas', () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  const validateRecord = ajv.compile(ProjectMaterialRecordSchema)
  const validateEntry = ajv.compile(MaterialIndexEntrySchema)

  test('a full record, a minimal one and `null` optionals pass', () => {
    expect(validateRecord(record())).toBe(true)
    expect(validateRecord({
      projectId: 'p', entityId: 'e', slotId: 's', scope: 'acme/s/new-project', path: 'a.txt', name: 'a.txt',
      size: 0, status: MaterialStatus.Received, createdAt: new Date(),
    })).toBe(true)
    expect(validateRecord(record({ reason: null, purpose: null, mime: null, details: null, uses: null } as any)))
      .toBe(true)
  })

  test('a stray key, an unknown status or purpose and an unknown use mode are refused', () => {
    expect(validateRecord({ ...record(), extra: 1 })).toBe(false)
    expect(validateRecord(record({ status: 'lost' as MaterialStatus }))).toBe(false)
    expect(validateRecord(record({ purpose: 'banner' as MaterialPurpose }))).toBe(false)
    expect(validateRecord(record({ uses: [{ target: 'logo', by: 'guess' as MaterialUseBy }] }))).toBe(false)
  })

  test('a use target and a file kind stay open strings — a newer agent may name new ones', () => {
    expect(validateRecord(record({ kind: 'model-gltf', uses: [{ target: 'ar-preview', by: MaterialUseBy.Analysis }] })))
      .toBe(true)
  })

  test('details are an open object a collection validator accepts', () => {
    expect(validateRecord(record({ details: { duration: 12.5, codec: 'h264', nested: { a: 1 } } }))).toBe(true)
    expect((ProjectMaterialRecordSchema as any).properties.details.additionalProperties).toBe(true)
  })

  test('no `integer` anywhere: a stored number is a double', () => {
    expect(JSON.stringify(ProjectMaterialRecordSchema)).not.toContain('"integer"')
  })

  test('an index entry carries no platform key', () => {
    const keys = Object.keys((MaterialIndexEntrySchema as any).properties)
    for (const key of MATERIAL_PLATFORM_KEYS) expect(keys).not.toContain(key)
    expect(validateEntry(materialIndexHelper.entryOf(record()))).toBe(true)
    expect(validateEntry({ ...materialIndexHelper.entryOf(record()), projectId: 'p' })).toBe(false)
  })
})

describe('viable-common — materials catalogue document', () => {
  test('an entry drops the platform ids, the scope and the timestamps, and unset fields', () => {
    const entry = materialIndexHelper.entryOf(dropped)
    expect(Object.keys(entry)).toEqual(['path', 'name', 'size', 'mime', 'kind', 'status', 'reason'])
    for (const key of MATERIAL_PLATFORM_KEYS) expect(entry).not.toHaveProperty(key)
  })

  test('the same entries in any order render the same bytes', () => {
    const one = materialIndexHelper.render([record(), spec, dropped])
    const two = materialIndexHelper.render([dropped, record({ details: { palette: ['#112233'], height: 128, width: 512 } }), spec])
    expect(two).toBe(one)
    expect(materialIndexHelper.render([record(), spec, dropped])).toBe(one)
  })

  test('the frontmatter is JSON, versioned, sorted by path, and parses back to the entries', () => {
    const markdown = materialIndexHelper.render([record(), spec, dropped])
    expect(markdown.startsWith('---\n{\n  "version": 1,\n  "entries": [')).toBe(true)
    const entries = materialIndexHelper.parse(markdown)
    expect(entries.map(entry => entry.path)).toEqual(['brand/logo.svg', 'docs/Product Spec.pdf', 'tools/setup.exe'])
    expect(entries).toEqual([record(), spec, dropped].map(materialIndexHelper.entryOf)
      .sort((a, b) => a.path < b.path ? -1 : 1))
    // Rendering what was parsed changes nothing.
    expect(materialIndexHelper.render(entries)).toBe(markdown)
  })

  test('the table is readable and never breaks a column', () => {
    const markdown = materialIndexHelper.render([record(), spec, dropped])
    const body = markdown.split('\n---\n')[1]!
    expect(body).toContain('# Project materials')
    expect(body).toContain('| File | Purpose | Type | Size | Status | Uses | Description |')
    expect(body).toContain('placed at `sources/web/public/assets/brand/logo.svg`')
    expect(body).toContain('removed (executable)')
    expect(body).toContain('logo (name)')
    expect(body).toContain('2.0 MiB')
    expect(body).toContain('3.2 KiB')
    expect(body).toContain('text `docs/materials/docs/Product Spec.pdf.md`')
    expect(body).toContain('The company logo \\| wordmark on white.')
    const rows = body.split('\n').filter(line => line.startsWith('| `'))
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.split(/(?<!\\)\|/).length).toBe(9)
  })

  test('an empty catalogue still renders a valid document', () => {
    const markdown = materialIndexHelper.render([])
    expect(materialIndexHelper.parse(markdown)).toEqual([])
    expect(markdown).toContain('_No materials._')
  })

  test('parse is total: no frontmatter, bad JSON or a broken entry gives fewer entries, never a throw', () => {
    expect(materialIndexHelper.parse('')).toEqual([])
    expect(materialIndexHelper.parse('# just a title')).toEqual([])
    expect(materialIndexHelper.parse('---\n{ not json\n---\n')).toEqual([])
    expect(materialIndexHelper.parse('---\n{"version":1}\n---\n')).toEqual([])
    expect(materialIndexHelper.parse('---\n{"version":1,"entries":[{"path":"a"},'
      + '{"path":"b.png","name":"b.png","size":1,"status":"received","projectId":"leak"}]}\n---\n'))
      .toEqual([{ path: 'b.png', name: 'b.png', size: 1, status: MaterialStatus.Received }])
    expect(materialIndexHelper.parse('---\n{"entries":[{"path":"c.png","name":"c.png","size":2,"status":"placed",'
      + '"uses":"logo","details":[1]}]}\n---\n')).toEqual([{ path: 'c.png', name: 'c.png', size: 2, status: MaterialStatus.Placed }])
    const crlf = materialIndexHelper.render([spec]).replace(/\n/g, '\r\n')
    expect(materialIndexHelper.parse(crlf)).toHaveLength(1)
  })

  test('a string holding a fence or a newline cannot end the frontmatter early', () => {
    const tricky = record({ description: 'line one\n---\nline two' })
    expect(materialIndexHelper.parse(materialIndexHelper.render([tricky]))[0]?.description).toBe('line one\n---\nline two')
  })
})

describe('viable-common — materials relevance', () => {
  const entries: MaterialIndexEntry[] = [record(), spec, dropped].map(materialIndexHelper.entryOf)

  test('no query: every usable entry, removed and rejected left out', () => {
    expect(materialIndexHelper.relevant(entries).map(entry => entry.name)).toEqual(['logo.svg', 'Product Spec.pdf'])
  })

  test('by purpose', () => {
    expect(materialIndexHelper.relevant(entries, { purposes: [MaterialPurpose.Specification] }).map(e => e.name))
      .toEqual(['Product Spec.pdf'])
  })

  test('by mention: a whole name, case-insensitive, or the path', () => {
    const named = (text: string) => materialIndexHelper.relevant(entries, { mentions: [text] }).map(e => e.name)
    expect(named('Put LOGO.SVG in the header.')).toEqual(['logo.svg'])
    expect(named('see docs/Product Spec.pdf for details')).toEqual(['Product Spec.pdf'])
    expect(named('see assets/brand/logo.svg')).toEqual(['logo.svg'])
    expect(named('biglogo.svg and logo.svg.bak')).toEqual([])
    expect(named('setup.exe')).toEqual([])
  })

  test('purposes OR mentions; an empty mention matches nothing', () => {
    expect(materialIndexHelper.relevant(entries, {
      purposes: [MaterialPurpose.Specification], mentions: ['logo.svg'],
    }).map(e => e.name)).toEqual(['logo.svg', 'Product Spec.pdf'])
    expect(materialIndexHelper.relevant(entries, { mentions: [''] }).map(e => e.name))
      .toEqual(['logo.svg', 'Product Spec.pdf'])
  })
})

describe('viable-common — ReadBinaryFile in the slot vocabulary', () => {
  test('the command exists beside the write and the payload schema admits it', () => {
    expect(SlotFileCommand.ReadBinaryFile).toBe('readBinaryFile' as SlotFileCommand)
    const ajv = new Ajv({ strict: false })
    expect(ajv.validate(SlotCommandPayloadSchema, {
      type: SlotCommandType.Files, command: SlotFileCommand.ReadBinaryFile, args: { filePath: 'a.png' },
    })).toBe(true)
  })

  test('a stated executor deadline and a caller bound that outlasts it', () => {
    expect(FILE_COMMAND_DEADLINES[SlotFileCommand.ReadBinaryFile]).toBe(30_000)
    expect(slotCommandHelper.commandTimeout(SlotCommandType.Files, SlotFileCommand.ReadBinaryFile))
      .toBeGreaterThan(slotCommandHelper.commandDeadline(SlotCommandType.Files, SlotFileCommand.ReadBinaryFile))
  })
})
