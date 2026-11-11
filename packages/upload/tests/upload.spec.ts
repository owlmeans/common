import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import formats from 'ajv-formats'
import { streamBodyOf, RouteMethod } from '@owlmeans/route'
import {
  DEFAULT_UPLOAD_POLICY, FileKind, makeUploadProtocols, UploadPolicyError, UploadReason, UploadRejectedError,
  UploadSessionSchema, uploadPolicyHelper, uploadSessionParamOf, UploadedFileStatus, UploadSessionStatus,
} from '../src/index.js'

const MiB = 1024 * 1024

describe('@owlmeans/upload — uploadPolicyHelper', () => {
  test('normalize fills the defaults, keeps narrowed limits and refuses a limit that is not a positive integer', () => {
    expect(uploadPolicyHelper.normalize()).toEqual({ ...DEFAULT_UPLOAD_POLICY, refuse: [FileKind.Executable] })
    expect(uploadPolicyHelper.normalize({ maxFiles: 3, allow: [FileKind.Image] })).toMatchObject({ maxFiles: 3, allow: [FileKind.Image], unpackArchives: true })
    expect(() => uploadPolicyHelper.normalize({ maxFileBytes: 0 })).toThrow(UploadPolicyError)
    expect(() => uploadPolicyHelper.normalize({ maxTotalBytes: 1.5 })).toThrow(UploadPolicyError)
  })

  test('path keeps every name as written and refuses what climbs out, is absolute or carries controls', () => {
    expect(uploadPolicyHelper.path('./brand\\Logo (final).png')).toEqual({ ok: true, path: 'brand/Logo (final).png', name: 'Logo (final).png' })
    expect(uploadPolicyHelper.path('Документы//план.md')).toEqual({ ok: true, path: 'Документы/план.md', name: 'план.md' })
    expect(uploadPolicyHelper.path('../x.md')).toEqual({ ok: false, issue: 'traversal' })
    expect(uploadPolicyHelper.path('/etc/x')).toEqual({ ok: false, issue: 'absolute' })
    expect(uploadPolicyHelper.path('C:\\x.md')).toEqual({ ok: false, issue: 'absolute' })
    expect(uploadPolicyHelper.path('a\u0000b')).toEqual({ ok: false, issue: 'invalid-char' })
    expect(uploadPolicyHelper.path('./')).toEqual({ ok: false, issue: 'empty' })
    expect(uploadPolicyHelper.path(`${'a/'.repeat(64)}x`)).toEqual({ ok: false, issue: 'too-deep' })
    expect(uploadPolicyHelper.display('a\u202eb.md')).toBe('a_b.md')
  })

  test('precheck counts in order: path, duplicate (case-insensitive), per-file size, count, total', () => {
    const policy = uploadPolicyHelper.normalize({ maxFiles: 3, maxFileBytes: 100, maxTotalBytes: 250 })
    const checked = uploadPolicyHelper.precheck([
      { path: 'a.md', size: 100 },
      { path: '../b.md', size: 1 },
      { path: 'A.MD', size: 1 },
      { path: 'big.png', size: 101 },
      { path: 'c.md', size: 100 },
      { path: 'd.md', size: 100 },
      { path: 'e.md', size: 10 },
    ], policy, { totals: { files: 0, bytes: 0 }, paths: [] })

    expect(checked.accepted.map(item => item.path)).toEqual(['a.md', 'c.md', 'e.md'])
    expect(checked.refused.map(item => [item.index, item.reason])).toEqual([
      [1, UploadReason.PathInvalid], [2, UploadReason.Duplicate], [3, UploadReason.Limits], [5, UploadReason.Limits],
    ])
    expect(checked.totals).toEqual({ files: 3, bytes: 210 })
    expect(uploadPolicyHelper.precheck([{ path: 'x.md', size: 1 }], policy, { paths: ['X.md'] }).refused[0].reason).toBe(UploadReason.Duplicate)
  })

  test('a receiver rejection carries its reason through the message', () => {
    expect(new UploadRejectedError(UploadReason.Duplicate).reason).toBe(UploadReason.Duplicate)
    expect(new UploadRejectedError('nonsense').reason).toBe(UploadReason.RefusedKind)
  })
})

describe('@owlmeans/upload — makeUploadProtocols', () => {
  test('declares the six members under one base, the file route streamed with the per-file ceiling', () => {
    const tree = makeUploadProtocols({ alias: 'materials', path: '/materials', sessionParam: 'project', maxFileBytes: 12 * MiB, guards: 'g' })

    expect(tree.base.guards).toEqual(['g'])
    expect([tree.open, tree.state, tree.file, tree.remove, tree.seal, tree.abort].map(item => [item.alias, item.route.route.path, item.route.route.method])).toEqual([
      ['materials:open', '/', RouteMethod.POST],
      ['materials:state', '/:project', RouteMethod.GET],
      ['materials:file', '/:project/file', RouteMethod.PUT],
      ['materials:remove', '/:project/file/:file', RouteMethod.DELETE],
      ['materials:seal', '/:project/seal', RouteMethod.POST],
      ['materials:abort', '/:project/abort', RouteMethod.POST],
    ])
    expect(streamBodyOf(tree.file.route.route)).toEqual({ maxBytes: 12 * MiB, types: ['application/octet-stream'] })
    expect(uploadSessionParamOf(tree.remove)).toBe('project')
    expect(uploadSessionParamOf(makeUploadProtocols({ path: '/u', maxFileBytes: 1 }).file)).toBe('session')
  })

  test('a tree under a parent inherits it; a session parameter that is not a name is refused', () => {
    const parent = makeUploadProtocols({ alias: 'p', path: '/p', maxFileBytes: 1 }).base
    const tree = makeUploadProtocols({ alias: 'child', path: '/files', parent, service: 'agent', maxFileBytes: 1 })
    expect(tree.base.route.route).toMatchObject({ parent: 'p', service: 'agent' })
    expect(tree.file.route.route.service).toBe('agent')
    expect(() => makeUploadProtocols({ path: '/x', sessionParam: 'file', maxFileBytes: 1 })).toThrow(SyntaxError)
    expect(() => makeUploadProtocols({ path: '/x', sessionParam: 'a-b', maxFileBytes: 1 })).toThrow(SyntaxError)
  })

  test('the session schema validates the wire view', () => {
    const ajv = new Ajv({ strict: false })
    formats(ajv)
    const validate = ajv.compile(UploadSessionSchema)
    const now = new Date().toISOString()
    expect(validate({
      id: 's', status: UploadSessionStatus.Open, policy: uploadPolicyHelper.normalize(), totals: { files: 1, bytes: 3 }, createdAt: now, updatedAt: now,
      files: [{ id: 'f', path: 'a/b.md', name: 'b.md', size: 3, status: UploadedFileStatus.Accepted, kind: FileKind.Text }],
    })).toBe(true)
    expect(validate({ id: 's', status: 'closed' })).toBe(false)
  })
})
