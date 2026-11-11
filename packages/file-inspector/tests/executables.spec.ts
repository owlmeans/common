import { describe, expect, test } from 'bun:test'
import { FileKind, FileKindError, FileMimicryError, fileInspector } from '../src/index.js'
import { sourceOf } from './context.js'
import { DEX, ELF, JAVA_CLASS, MACHO, MACHO_FAT, PE_DLL, PE_EXE, PYC, SHEBANG, WASM } from './fixtures.js'

const FORMATS: Array<[string, Uint8Array, string, string]> = [
  ['ELF', ELF, 'tool.so', 'elf'],
  ['PE executable', PE_EXE, 'setup.exe', 'exe'],
  ['PE library', PE_DLL, 'helper.dll', 'dll'],
  ['Mach-O', MACHO, 'tool.dylib', 'macho'],
  ['Mach-O universal', MACHO_FAT, 'tool.dylib', 'macho'],
  ['Java class', JAVA_CLASS, 'Main.class', 'class'],
  ['Python bytecode', PYC, 'main.pyc', 'pyc'],
  ['WebAssembly', WASM, 'module.wasm', 'wasm'],
  ['Android dex', DEX, 'classes.dex', 'dex'],
]

describe('@owlmeans/file-inspector — executables', () => {
  test('detects every executable format as an executable, whatever the claim', async () => {
    for (const [label, data, , ext] of FORMATS) {
      const verdict = await fileInspector.inspect(data, {}, { complete: true })
      expect({ label, ext: verdict.detected?.ext, kind: verdict.detected?.kind }).toEqual({ label, ext, kind: FileKind.Executable })
    }
    // CAFEBABE: a universal binary counts its architectures where a class file keeps its version.
    expect((await fileInspector.inspect(MACHO_FAT)).detected?.ext).toBe('macho')
    expect((await fileInspector.inspect(JAVA_CLASS)).detected?.ext).toBe('class')
  })

  test('refuses an executable under a passive claim as dangerous', async () => {
    for (const [label, data] of FORMATS) {
      for (const name of ['photo.png', 'report.pdf', 'font.woff2', 'model.glb', 'chart.drawio', 'notes.txt']) {
        const verdict = await fileInspector.inspect(data, { name }, { complete: true })
        expect({ label, name, dangerous: verdict.dangerous, status: verdict.status }).toEqual({ label, name, dangerous: true, status: 'mismatch' })
        expect(() => fileInspector.enforce(verdict, { refuseMismatch: false })).toThrow(FileMimicryError)
      }
    }
    const script = await fileInspector.inspect(SHEBANG, { name: 'model.glb' }, { complete: true })
    expect(script).toMatchObject({ dangerous: true, reasons: ['executable-content'] })
  })

  test('matches an honest claim, and refuses it only when the policy refuses the kind', async () => {
    for (const [label, data, name] of FORMATS) {
      const verdict = await fileInspector.inspect(data, { name }, { complete: true })
      expect({ label, status: verdict.status, dangerous: verdict.dangerous }).toEqual({ label, status: 'match', dangerous: false })
      expect(fileInspector.enforce(verdict)).toBe(verdict)
      expect(() => fileInspector.enforce(verdict, { refuse: [FileKind.Executable] })).toThrow(FileKindError)
    }
  })

  test('refuses by claim too, and through a probe', async () => {
    // An unrecognized body under an executable name is still refused by the kind it claims.
    const unknown = await fileInspector.inspect(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), { name: 'payload.exe' }, { complete: true })
    expect(unknown.status).toBe('inconclusive')
    expect(() => fileInspector.enforce(unknown, { refuse: [FileKind.Executable] })).toThrow(FileKindError)
    await expect(fileInspector.check(sourceOf(PE_DLL, { name: 'helper.dll' }), { refuse: [FileKind.Executable] }))
      .rejects.toBeInstanceOf(FileKindError)
    expect((await fileInspector.check(sourceOf(PE_DLL, { name: 'helper.dll' }))).detected?.ext).toBe('dll')
  })
})
