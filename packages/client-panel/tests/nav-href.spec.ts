import { describe, expect, test } from 'bun:test'
import { makePanelNavPathHelper } from '../src/components/nav/path.js'
import { makeTestContext } from './context.js'

describe('@owlmeans/client-panel — navigation addresses under a base', () => {
  test('a menu entry\'s href carries the application\'s base; its path stays base-less', () => {
    const paths = makePanelNavPathHelper(makeTestContext('admin'))

    expect(paths.hrefOf('panel:users')).toBe('/admin/users')
    expect(paths.hrefOf('panel:users:list')).toBe('/admin/users/list')
    expect(paths.hrefOf('panel:settings')).toBe('/admin/settings')
    // What the current screen is matched against: router space, never the base.
    expect(paths.pathOf('panel:users')).toBe('/users')
    expect(paths.pathOf('panel:settings')).toBe('/settings')
  })

  test('a screen of another application gets no href: the click resolves its absolute address', () => {
    for (const base of ['admin', undefined]) {
      const paths = makePanelNavPathHelper(makeTestContext(base))
      expect(paths.hrefOf('panel:reports')).toBeUndefined()
      expect(paths.pathOf('panel:reports')).toBe('/reports')
    }
  })

  test('no honest href for a parameterized screen or an alias nothing bound', () => {
    const paths = makePanelNavPathHelper(makeTestContext('/admin/'))

    expect(paths.hrefOf('panel:user')).toBeUndefined()
    expect(paths.hrefOf('panel:nowhere')).toBeUndefined()
    expect(paths.pathOf('panel:nowhere')).toBeNull()
  })
})

describe('@owlmeans/client-panel — navigation addresses at the root', () => {
  test('href is the declared path exactly as before, for every spelling of the root', () => {
    for (const base of [undefined, '', '/']) {
      const paths = makePanelNavPathHelper(makeTestContext(base))

      expect(paths.hrefOf('panel:users')).toBe('/users')
      expect(paths.hrefOf('panel:users:list')).toBe('/users/list')
      expect(paths.hrefOf('panel:settings')).toBe('/settings')
      expect(paths.hrefOf('panel:user')).toBeUndefined()
      expect(paths.pathOf('panel:users')).toBe(paths.hrefOf('panel:users') ?? null)
    }
  })
})
