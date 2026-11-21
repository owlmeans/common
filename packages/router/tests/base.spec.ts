import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { routerBaseHelper } from '../src/base.js'

const { normalize, strip, join, baseOf } = routerBaseHelper

/** The three spellings of "served at the root". */
const ROOTS = [undefined, null, '', '/', '  ', '//']

/** Every shape of address an application hands to a boundary. */
const ADDRESSES = [
  '/', '/users', '/users/42', '/users/42?token=abc', '/users/42?token=abc#top', '/users/', '/admin',
  '/admin/users', '/dispatcher?login-method=oidc', '?tab=2', '#main', '', 'users', './users', '../x',
  'https://example.com/a', 'http://localhost:5173/', '//cdn.example.com/x.js', 'mailto:a@b.c',
  'data:image/svg+xml,abc',
]

const contextWith = (base?: string) => makeBasicContext<BasicConfig>({
  ready: false, service: 'web', type: AppType.Frontend,
  services: { web: { service: 'web', type: AppType.Frontend, host: 'example.com', ...(base != null ? { base } : {}) } },
})

describe('routerBaseHelper — normalize', () => {
  test('the root in any spelling is empty', () => {
    for (const base of ROOTS) expect(normalize(base)).toBe('')
  })

  test('a mount reads with one leading and no trailing separator', () => {
    expect([normalize('admin'), normalize('/admin'), normalize('/admin/'), normalize(' admin/ '), normalize('a/b/')])
      .toEqual(['/admin', '/admin', '/admin', '/admin', '/a/b'])
  })
})

describe('routerBaseHelper — strip', () => {
  test.each([
    ['/admin/users', '/admin', '/users'],
    ['/admin/users/42', 'admin', '/users/42'],
    ['/admin', '/admin', '/'],
    ['/admin/', '/admin', '/'],
    // Outside the base: unchanged, never cut at a partial segment.
    ['/administration', '/admin', '/administration'],
    ['/users', '/admin', '/users'],
    ['/', '/admin', '/'],
  ])('%s under %s reads %s', (pathname, base, expected) => {
    expect(strip(pathname, base)).toBe(expected)
  })
})

describe('routerBaseHelper — join', () => {
  test.each([
    ['/admin', '/', '/admin/'],
    ['/admin', '/users/42?token=abc', '/admin/users/42?token=abc'],
    ['admin/', '/users', '/admin/users'],
    ['/admin', '/admin/users', '/admin/admin/users'],
  ])('%s + %s = %s', (base, path, expected) => {
    expect(join(base, path)).toBe(expected)
  })

  test('anything that is not a root-relative path is left alone', () => {
    for (const path of ['https://example.com/a', '//cdn.example.com/x.js', 'mailto:a@b.c', '#main', '?tab=2', 'users', './users', '']) {
      expect(join('/admin', path)).toBe(path)
    }
  })

  test('strip reads back what join wrote', () => {
    for (const path of ['/', '/users', '/users/42', '/admin']) {
      expect(strip(join('/admin', path), '/admin')).toBe(path)
    }
  })
})

describe('routerBaseHelper — baseOf', () => {
  test('reads the context\'s own frontend service base, normalized', () => {
    expect(baseOf(contextWith('admin'))).toBe('/admin')
    expect(baseOf(contextWith('/app/'))).toBe('/app')
  })

  test('no context, no service entry or no base is the root', () => {
    expect(baseOf()).toBe('')
    expect(baseOf(null)).toBe('')
    expect(baseOf(contextWith())).toBe('')
    expect(baseOf(contextWith('/'))).toBe('')
    expect(baseOf(makeBasicContext<BasicConfig>({ ready: false, service: 'web', type: AppType.Frontend }))).toBe('')
  })
})

describe('routerBaseHelper — the root is the identity', () => {
  test('join and strip return every address unchanged at the root', () => {
    for (const base of ROOTS) {
      for (const address of ADDRESSES) {
        expect(join(base, address)).toBe(address)
        expect(strip(address, base)).toBe(address)
      }
    }
  })

  test('a context without a base joins nothing', () => {
    for (const ctx of [contextWith(), contextWith('/'), contextWith('')]) {
      for (const address of ADDRESSES) expect(join(baseOf(ctx), address)).toBe(address)
    }
  })
})
