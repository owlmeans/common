import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

type Lib = typeof import('../src/index.js')

/**
 * Two module instances of this package in one process — what `bun --preserve-symlinks` produces
 * when a linked workspace reaches `@owlmeans/error` through two `node_modules` paths.
 *
 * The sources are copied to two directories, so every module of the package (not only the entry)
 * is loaded twice. `@owlmeans/i18n` resolves through a `node_modules` link to the workspace root.
 */
const loadTwice = async (): Promise<{ root: string, a: Lib, b: Lib }> => {
  const root = mkdtempSync(join(tmpdir(), 'owlmeans-error-copies-'))
  const workspaceModules = resolve(import.meta.dir, '../../../node_modules')
  for (const name of ['a', 'b']) {
    cpSync(resolve(import.meta.dir, '../src'), join(root, name, 'src'), { recursive: true })
    symlinkSync(workspaceModules, join(root, name, 'node_modules'))
  }
  const a = await import(join(root, 'a', 'src', 'index.ts')) as Lib
  const b = await import(join(root, 'b', 'src', 'index.ts')) as Lib

  return { root, a, b }
}

/** The same family declared by each copy, the way two copies of one package declare it. */
const familyOf = (lib: Lib) => {
  class CopyApiError extends lib.ResilientError {
    public static override typeName = 'CopyTestApiError'

    constructor(message: string = 'error') {
      super(CopyApiError.typeName, `copy-api:${message}`)
    }
  }

  class CopyAuthFailed extends CopyApiError {
    public static override typeName = 'CopyTestAuthFailedError'

    constructor(message: string = 'error') {
      super(`auth:${message}`)
      this.type = CopyAuthFailed.typeName
    }
  }

  class CopyAccess extends CopyApiError {
    public static override typeName = 'CopyTestAccessError'

    constructor(message: string = 'error') {
      super(`access:${message}`)
      this.type = CopyAccess.typeName
    }
  }

  lib.ResilientError.registerErrorClass(CopyApiError)
  lib.ResilientError.registerErrorClass(CopyAuthFailed)
  lib.ResilientError.registerErrorClass(CopyAccess)

  return { CopyApiError, CopyAuthFailed, CopyAccess }
}

describe('duplicate module copies behave as one', () => {
  let root = ''
  let a: Lib
  let b: Lib
  let A: ReturnType<typeof familyOf>
  let B: ReturnType<typeof familyOf>

  beforeAll(async () => {
    ({ root, a, b } = await loadTwice())
    A = familyOf(a)
    B = familyOf(b)
  })

  afterAll(() => {
    if (root !== '') {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('the two copies are distinct module instances sharing one registry', () => {
    expect(a.ResilientError).not.toBe(b.ResilientError)
    expect(a.ResilientError.converters).toBe(b.ResilientError.converters)
    const catchAll = Symbol.for('@owlmeans/error:catch-all')
    expect(b.ResilientError.converters.filter(converter => (converter as any)[catchAll] === true)).toHaveLength(1)
  })

  test('an error thrown by copy A is ensured as-is and marshalled with its type by copy B', () => {
    const thrown = new A.CopyAuthFailed('no-guard')

    expect(b.ResilientError.ensure(thrown)).toBe(thrown)
    expect(b.isResilientError(thrown)).toBe(true)
    const wire = b.ResilientError.marshal(b.ResilientError.ensure(thrown)).message
    expect(wire.split(b.SEPARATOR).slice(0, 2)).toEqual(['CopyTestAuthFailedError', 'copy-api:auth:no-guard'])

    const rebuilt = b.ResilientError.ensure(wire)
    // The last registration of the type name wins — copy B registered after copy A.
    expect(rebuilt.constructor).toBe(B.CopyAuthFailed)
    expect(rebuilt).toBeInstanceOf(A.CopyAuthFailed)
    expect(rebuilt.type).toBe('CopyTestAuthFailedError')
    expect(rebuilt.message).toBe('copy-api:auth:no-guard')
  })

  test('a class registered by one copy only is rebuilt by the other', () => {
    class OnlyInA extends a.ResilientError {
      public static override typeName = 'CopyTestOnlyInA'

      constructor(message: string = 'error') {
        super(OnlyInA.typeName, `only-a:${message}`)
      }
    }
    a.ResilientError.registerErrorClass(OnlyInA)

    const rebuilt = b.ResilientError.ensure(new OnlyInA('x').marshal().message)
    expect(rebuilt).toBeInstanceOf(OnlyInA)
    expect(rebuilt.message).toBe('only-a:x')
  })

  test('instanceof across copies matches the class and its ancestors, never a sibling or a parent', () => {
    const thrown = new A.CopyAuthFailed('x')
    expect(thrown instanceof B.CopyAuthFailed).toBe(true)
    expect(thrown instanceof B.CopyApiError).toBe(true)
    expect(thrown instanceof b.ResilientError).toBe(true)
    expect(thrown instanceof B.CopyAccess).toBe(false)
    expect(new A.CopyApiError('x') instanceof B.CopyAuthFailed).toBe(false)

    // A subclass without a type name of its own is matched natively only.
    class Unnamed extends B.CopyAuthFailed { }
    expect(new A.CopyAuthFailed('x') instanceof Unnamed).toBe(false)
    expect(new Unnamed('x') instanceof A.CopyAuthFailed).toBe(true)

    // Shape alone is not a resilient error: the brand is.
    const lookalike = Object.assign(new Error('x'), { type: 'CopyTestAuthFailedError', marshal: () => new Error('x') })
    expect(lookalike instanceof b.ResilientError).toBe(false)
    expect(b.ResilientError.ensure(lookalike)).not.toBe(lookalike)
  })
})
