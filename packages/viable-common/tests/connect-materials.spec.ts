import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ResilientError } from '@owlmeans/error'
import { aliasOf, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { RouteMethod, streamBodyOf } from '@owlmeans/route'
import { DEFAULT_UPLOAD_POLICY, FileKind, uploadPolicyHelper, uploadSessionParamOf } from '@owlmeans/upload'
import { connect, CONNECT_MATERIAL_TEXT_MAX, ConnectMaterialTextSource, ConnectPaidGate } from '../src/connect/consts.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { ConnectMaterialUnknown } from '../src/connect/errors.js'
import { connectRef } from '../src/connect/references.js'
import {
  ConnectCreateBodySchema, ConnectCreateWithMaterialsBodySchema, ConnectMaterialQuerySchema, ConnectMaterialsAnnouncementSchema,
  ConnectMaterialsDraftBodySchema,
} from '../src/connect/schemas.js'
import { MATERIAL_PATH_MAX, MATERIALS_LIMITS, MATERIALS_UPLOAD_POLICY, MaterialStatus } from '../src/materials/consts.js'
import { materialIndexHelper } from '../src/materials/catalogue.js'

const ajv = new Ajv({ strict: false })

describe('@owlmeans/viable-common — a new project\'s files through the connector', () => {
  const tree = connectProtocols({
    guard: DEFAULT_GUARD,
    gate: { alias: 'test-gate', params: ['owner'] },
    paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
  })
  const { materials } = tree.project

  test('a create that waits for its files: a route of its own beside create, the same answer, no paid gate', () => {
    const route = tree.project.createWithMaterials.route.route

    expect([route.method, route.path, aliasOf(route.parent)]).toEqual([RouteMethod.POST, '/project/with-materials', connect.base])
    expect(tree.project.createWithMaterials.gate).toBeUndefined()
    expect(tree.project.create.route.route.path).toBe('/project')
    expect(connectRef.project.createWithMaterials.alias).toBe(connect.project.createWithMaterials)
  })

  test('the upload tree under the owned base — the session is the project, no open or abort, the file a stream at the transport ceiling', () => {
    expect([materials.base.route.route.path, aliasOf(materials.base.route.route.parent)]).toEqual(['/project/materials', connect.base])
    expect(['open' in materials, 'abort' in materials]).toEqual([false, false])
    expect([materials.state, materials.file, materials.remove, materials.seal, materials.draft, materials.catalogue, materials.read]
      .map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`)).toEqual([
      'GET /:id', 'PUT /:id/file', 'DELETE /:id/file/:file', 'POST /:id/seal', 'POST /:id/draft',
      'GET /:id/catalogue', 'GET /:id/content',
    ])
    for (const protocol of protocols(materials).filter(one => one !== materials.base)) {
      expect([protocol.alias, aliasOf(protocol.route.route.parent)]).toEqual([protocol.alias, connect.project.materials.base])
      // The ownership gate alone, inherited from the base: reading or sending a file spends nothing.
      expect([protocol.alias, protocol.gate]).toEqual([protocol.alias, undefined])
    }
    expect(uploadSessionParamOf(materials.file)).toBe('id')
    expect(streamBodyOf(materials.file.route.route)?.maxBytes).toBe(MATERIALS_LIMITS.fileBytes)
    // The aliases are the upload library's own (`<base>:<member>`), and the typed references name them.
    expect([materials.state.alias, materials.seal.alias]).toEqual([connect.project.materials.state, connect.project.materials.seal])
    expect([connectRef.project.materials.file.alias, connectRef.project.materials.read.alias, connectRef.project.materials.draft.alias])
      .toEqual([connect.project.materials.file, connect.project.materials.read, connect.project.materials.draft])
  })

  test('the create body is untouched; the new body is the create body plus the announcement', () => {
    const legacy = ajv.compile(ConnectCreateBodySchema)
    const withFiles = ajv.compile(ConnectCreateWithMaterialsBodySchema)
    const materialsBody = { files: 3, bytes: 4096 }

    // An older platform's closed body: it still refuses the announcement.
    expect(legacy({ prompt: 'A bakery' })).toBe(true)
    expect(legacy({ prompt: 'A bakery', materials: materialsBody })).toBe(false)
    expect(Object.keys(ConnectCreateBodySchema.properties).sort()).toEqual(['prompt', 'sessionId', 'target'])

    expect(withFiles({ prompt: 'A bakery', materials: materialsBody })).toBe(true)
    expect(withFiles({ prompt: 'A bakery', target: 'local', sessionId: 's1', materials: materialsBody })).toBe(true)
    expect(withFiles({ prompt: 'A bakery', target: null, sessionId: null, materials: materialsBody })).toBe(true)
    expect(withFiles({ prompt: 'A bakery' })).toBe(false)
    expect(withFiles({ prompt: 'A bakery', materials: materialsBody, extra: true })).toBe(false)
    expect(Object.keys(ConnectCreateWithMaterialsBodySchema.properties).sort())
      .toEqual([...Object.keys(ConnectCreateBodySchema.properties), 'materials'].sort())
  })

  test('the announcement stays within the limits of the expanded set', () => {
    const announcement = ajv.compile(ConnectMaterialsAnnouncementSchema)

    expect(announcement({ files: 1, bytes: 0 })).toBe(true)
    expect(announcement({ files: MATERIALS_LIMITS.files, bytes: MATERIALS_LIMITS.totalBytes })).toBe(true)
    expect(announcement({ files: 0, bytes: 10 })).toBe(false)
    expect(announcement({ files: MATERIALS_LIMITS.files + 1, bytes: 10 })).toBe(false)
    expect(announcement({ files: 2, bytes: MATERIALS_LIMITS.totalBytes + 1 })).toBe(false)
    expect(announcement({ files: 1.5, bytes: 10 })).toBe(false)
    expect(announcement({ files: 1 })).toBe(false)
  })

  test('a material by its path; the draft\'s force optional', () => {
    const query = ajv.compile(ConnectMaterialQuerySchema)
    const draft = ajv.compile(ConnectMaterialsDraftBodySchema)

    expect(query({ path: 'brand/logo.svg' })).toBe(true)
    expect(query({ path: '' })).toBe(false)
    expect(query({ path: 'x'.repeat(MATERIAL_PATH_MAX + 1) })).toBe(false)
    expect(query({})).toBe(false)
    expect(draft({})).toBe(true)
    expect(draft({ force: true })).toBe(true)
    expect(draft({ force: null })).toBe(true)
    expect(draft({ force: 'yes' })).toBe(false)
  })

  test('one upload policy for every runtime: the limits, archives unpacked, programs refused', () => {
    expect(MATERIALS_UPLOAD_POLICY).toEqual({
      ...DEFAULT_UPLOAD_POLICY,
      maxFiles: MATERIALS_LIMITS.files,
      maxFileBytes: MATERIALS_LIMITS.fileBytes,
      maxTotalBytes: MATERIALS_LIMITS.totalBytes,
      unpackArchives: true,
      refuse: [FileKind.Executable],
    })
    expect(Object.isFrozen(MATERIALS_UPLOAD_POLICY)).toBe(true)
    const checked = uploadPolicyHelper.precheck([
      { path: 'brief.md', size: 10 },
      { path: 'big.mp4', size: MATERIALS_LIMITS.fileBytes + 1 },
      { path: '../escape.txt', size: 1 },
    ], MATERIALS_UPLOAD_POLICY)
    expect(checked.accepted.map(one => one.path)).toEqual(['brief.md'])
    expect(checked.refused.map(one => [one.path, one.reason])).toEqual([['big.mp4', 'limits'], ['../escape.txt', 'path-invalid']])
  })

  test('a material the project has not is a 404 refusal that survives the hop; the read cap is read_file\'s', () => {
    const refused = new ConnectMaterialUnknown('brand/logo.svg')
    const back = ResilientError.ensure(refused.marshal())

    expect(refused.message).toBe('viable-connect:material-unknown:brand/logo.svg')
    expect(ConnectMaterialUnknown.httpStatus).toBe(404)
    expect(back).toBeInstanceOf(ConnectMaterialUnknown)
    expect(CONNECT_MATERIAL_TEXT_MAX).toBe(100_000)
    expect(Object.values(ConnectMaterialTextSource).sort()).toEqual(['text', 'transcript'])
  })

  test('a file\'s own text is read by kind, type or extension — a document\'s is its transcript', () => {
    const entry = (name: string, extra: Record<string, unknown> = {}) =>
      ({ path: name, name, size: 1, status: MaterialStatus.Catalogued, ...extra })

    expect(materialIndexHelper.textual(entry('brief.md'))).toBe(true)
    expect(materialIndexHelper.textual(entry('blob', { kind: 'code' }))).toBe(true)
    expect(materialIndexHelper.textual(entry('blob', { mime: 'text/csv' }))).toBe(true)
    expect(materialIndexHelper.textual(entry('logo', { mime: 'image/svg+xml' }))).toBe(true)
    expect(materialIndexHelper.textual(entry('flow.drawio'))).toBe(true)
    expect(materialIndexHelper.textual(entry('spec.pdf', { kind: 'pdf', mime: 'application/pdf' }))).toBe(false)
    expect(materialIndexHelper.textual(entry('logo.png', { kind: 'image', mime: 'image/png' }))).toBe(false)
    expect(materialIndexHelper.textual(entry('.md'))).toBe(false)
  })
})
