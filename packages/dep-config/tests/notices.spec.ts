import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createThirdPartyNoticesPlugin } from '../notices.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'owlmeans-notices-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-app', private: true }))
  return root
}

const dependency = (root: string, name: string, version = '1.0.0', license = 'MIT') => {
  const dir = join(root, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, license }))
  writeFileSync(join(dir, 'index.js'), 'export const value = 1')
  return dir
}

const generate = (root: string, ids: string[], extra = {}) => {
  let result = ''
  createThirdPartyNoticesPlugin({ root, ...extra }).generateBundle.call({
    emitFile: asset => { result = asset.source; return asset.fileName },
  }, {}, { 'entry.js': { type: 'chunk', modules: Object.fromEntries(ids.map(id => [id, {}])) } })
  return result
}

test('bundled packages, lazy chunks and additional assets retain their complete notices', () => {
  const root = fixture()
  const bundled = dependency(root, 'bundled')
  writeFileSync(join(bundled, 'LICENSE'), 'Copyright bundled\nMIT permission\n')
  writeFileSync(join(bundled, 'NOTICE'), 'Upstream attribution\n')
  writeFileSync(join(bundled, 'ThirdPartyNotices.txt'), 'Embedded component license\n')
  writeFileSync(join(bundled, 'ThirdPartyNoticeText.txt'), 'Compiler embedded notices\n')
  const unused = dependency(root, 'build-only')
  writeFileSync(join(unused, 'LICENSE'), 'Do not include tooling\n')
  const font = dependency(root, 'font', '2.0.0', 'OFL-1.1')
  writeFileSync(join(font, 'LICENSE'), 'Font copyright and OFL\n')
  writeFileSync(join(root, 'THIRD-PARTY-NOTICES.txt'), 'Copied source license\n')
  const plugin = createThirdPartyNoticesPlugin({ root, additionalPackages: ['font'] })
  let result = ''
  plugin.generateBundle.call({ emitFile: asset => { result = asset.source; return '' } }, {}, {
    'entry.js': { type: 'chunk', modules: {} },
    'lazy.js': { type: 'chunk', modules: { [join(bundled, 'index.js')]: {} } },
  })
  for (const text of ['MIT permission', 'Upstream attribution', 'Embedded component license', 'Compiler embedded notices', 'Font copyright and OFL', 'Copied source license']) expect(result).toContain(text)
  expect(result).not.toContain('Do not include tooling')
})

test('exact nested versions and linked packages keep separate license texts without duplicate documents', () => {
  const root = fixture()
  const first = dependency(root, 'library', '1.0.0')
  const second = dependency(first, 'library', '2.0.0')
  writeFileSync(join(first, 'LICENSE'), 'Copyright version one\n')
  writeFileSync(join(second, 'LICENSE'), 'Copyright version two\n')
  const linked = join(root, 'workspace')
  mkdirSync(linked)
  writeFileSync(join(linked, 'package.json'), JSON.stringify({ name: '@owlmeans/linked' }))
  writeFileSync(join(linked, 'THIRD-PARTY-NOTICES.txt'), 'Copied shadcn license\n')
  writeFileSync(join(linked, 'index.js'), '')
  mkdirSync(join(root, 'node_modules/@owlmeans'), { recursive: true })
  symlinkSync(linked, join(root, 'node_modules/@owlmeans/linked'))
  const ids = [join(second, 'index.js'), join(first, 'index.js'), join(root, 'node_modules/@owlmeans/linked/index.js'), join(linked, 'index.js')]
  const text = generate(root, ids)
  expect(text).toContain('library@1.0.0')
  expect(text).toContain('library@2.0.0')
  expect(text.split('Copied shadcn license').length).toBe(2)
  expect(generate(root, [...ids].reverse())).toBe(text)
})

test('missing or empty license documents fail before emitting a partial artifact', () => {
  const root = fixture()
  const dir = dependency(root, 'missing')
  expect(() => generate(root, [join(dir, 'index.js')])).toThrow('missing license text for missing@1.0.0')
  writeFileSync(join(dir, 'LICENSE'), '')
  expect(() => generate(root, [join(dir, 'index.js')])).toThrow('empty')
  expect(() => generate(root, [], { additionalFiles: ['absent.txt'] })).toThrow()
})

test('notice-free grants impose no invented attribution requirement', () => {
  const root = fixture()
  const dir = dependency(root, 'notice-free', '1.0.0', 'MIT-0')
  expect(generate(root, [join(dir, 'index.js')])).not.toContain('notice-free')
})


test('export subdirectory manifests use the containing package license', () => {
  const root = fixture()
  const dir = dependency(root, '@forms/resolvers')
  writeFileSync(join(dir, 'LICENSE'), 'Containing package MIT permission')
  mkdirSync(join(dir, 'ajv'))
  writeFileSync(join(dir, 'ajv/package.json'), JSON.stringify({ name: '@forms/resolvers/ajv' }))
  writeFileSync(join(dir, 'ajv/index.js'), '')
  expect(generate(root, [join(dir, 'ajv/index.js')])).toContain('Containing package MIT permission')
})

test('complete README grants and nested vendored licenses accompany emitted code', () => {
  const root = fixture()
  const dir = dependency(root, 'vendor')
  writeFileSync(join(dir, 'README.md'), '# Vendor\n\nLicense\n-------\nCopyright Vendor\nPermission is hereby granted\nTHE SOFTWARE IS PROVIDED')
  mkdirSync(join(dir, 'lib-vendor/component'), { recursive: true })
  writeFileSync(join(dir, 'lib-vendor/component/index.js'), '')
  writeFileSync(join(dir, 'lib-vendor/component/LICENSE'), 'Nested copyright and grant')
  const text = generate(root, [join(dir, 'lib-vendor/component/index.js')])
  expect(text).toContain('Copyright Vendor')
  expect(text).toContain('Nested copyright and grant')
})

test('missing upstream texts use only an exact-version offline recovery', () => {
  const root = fixture()
  const dir = dependency(root, 'react-remove-scroll-bar', '2.3.8')
  expect(generate(root, [join(dir, 'index.js')])).toContain('Anton Korzunov')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'react-remove-scroll-bar', version: '99.0.0', license: 'MIT' }))
  expect(() => generate(root, [join(dir, 'index.js')])).toThrow('react-remove-scroll-bar@99.0.0')
})

test('only actual virtual Vite helpers add Vite notices to a Rollup build', () => {
  const root = fixture()
  const plugin = createThirdPartyNoticesPlugin({ root })
  const context = { emitFile: () => '' }
  expect(() => plugin.generateBundle.call(context, {}, {
    'app.js': { type: 'chunk', modules: {}, code: 'const hint = "modulepreload"' },
  })).not.toThrow()
  const modules = { '\0vite/preload-helper.js': {} }
  expect(() => plugin.generateBundle.call(context, {}, { 'app.js': { type: 'chunk', modules } })).toThrow('cannot resolve vite')
  const dir = dependency(root, 'vite')
  writeFileSync(join(dir, 'LICENSE'), 'Copyright Vite\nMIT grant')
  expect(generate(root, Object.keys(modules))).toContain('Copyright Vite')
})
