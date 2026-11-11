import { describe, expect, test } from 'bun:test'
import { Ajv } from 'ajv'
import { FileScopeError, FileScopeSchema, fileScopeHelper } from '../src/index.js'

describe('@owlmeans/storage-common — file scopes', () => {
  test('nests organization, optional project and purpose, and reads the path back', () => {
    expect(fileScopeHelper.pathOf({ organization: 'acme', project: 'slot-12', purpose: 'new-project' })).toBe('acme/slot-12/new-project')
    expect(fileScopeHelper.pathOf({ organization: 'acme', purpose: 'upload' })).toBe('acme/upload')
    expect(fileScopeHelper.parse('acme/slot-12/new-project')).toEqual({ organization: 'acme', project: 'slot-12', purpose: 'new-project' })
    expect(fileScopeHelper.parse('acme/upload')).toEqual({ organization: 'acme', purpose: 'upload' })
  })

  test('refuses segments that could escape or collide: dots, separators, empty, too long', () => {
    for (const bad of ['.', '..', '.hidden', 'a/b', 'a\\b', '', ' acme', '_x', '-x', 'é', 'x'.repeat(129)]) {
      expect(fileScopeHelper.isSegment(bad)).toBe(false)
    }
    expect(fileScopeHelper.isSegment('A1._-z')).toBe(true)
    expect(fileScopeHelper.isSegment('x'.repeat(128))).toBe(true)
    expect(() => fileScopeHelper.pathOf({ organization: 'acme', project: '..', purpose: 'p' })).toThrow('stored-file:scope:project')
    expect(() => fileScopeHelper.assert({ organization: 'acme', purpose: '' })).toThrow(FileScopeError)
    expect(() => fileScopeHelper.assert('acme/p')).toThrow('stored-file:scope:shape')
  })

  test('parses only two- or three-segment paths of valid segments', () => {
    for (const bad of ['acme', 'acme/a/b/c', '/acme/p', 'acme/p/', 'acme/../p', 'acme//p']) {
      expect(() => fileScopeHelper.parse(bad)).toThrow('stored-file:scope:path')
    }
  })

  test('the schema accepts exactly what the helper accepts', () => {
    const validate = new Ajv().compile(FileScopeSchema)
    expect(validate({ organization: 'acme', project: 'slot-12', purpose: 'new-project' })).toBe(true)
    expect(validate({ organization: 'acme', purpose: 'upload' })).toBe(true)
    expect(validate({ organization: 'acme', purpose: '..' })).toBe(false)
    expect(validate({ organization: 'acme', purpose: 'p', extra: 1 })).toBe(false)
    expect(validate({ organization: 'x'.repeat(129), purpose: 'p' })).toBe(false)
  })
})
