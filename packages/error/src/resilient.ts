import { CATCH_ALL_CONVERTER, CONVERTER_REGISTRY, RESILENT_ERROR, RESILIENT_BRAND, SEPARATOR } from './consts.js'
import type { Converter, MarshalErrorOptions, ResilientErrorConstructor } from './types.js'
import { createErrorConverter } from './utils.js'

type ConverterHolder = typeof globalThis & { [CONVERTER_REGISTRY]?: Converter[] }

/**
 * The one converter registry of the process.
 *
 * Kept on `globalThis` so every copy of this module registers into, and unmarshals from, the same
 * list: a class registered by one copy is rebuilt by another. Registration order is kept across
 * copies, so the last registration of a type name still wins.
 */
const sharedConverters = (): Converter[] => {
  const holder = globalThis as ConverterHolder
  holder[CONVERTER_REGISTRY] ??= []

  return holder[CONVERTER_REGISTRY]
}

/**
 * The type names a class declares itself and inherits, nearest first — only names a class owns.
 *
 * A class that does not redeclare `typeName` inherits its parent's value, and counting that twice
 * would let a check against the subclass match any instance of the parent.
 */
const lineageOf = (ctor: unknown): string[] => {
  const names: string[] = []
  let current = ctor
  while (typeof current === 'function') {
    if (Object.prototype.hasOwnProperty.call(current, 'typeName')) {
      const name = (current as { typeName?: unknown }).typeName
      if (typeof name === 'string') {
        names.push(name)
      }
    }
    current = Object.getPrototypeOf(current)
  }

  return names
}

/**
 * Whether a value is a `ResilientError` built by ANY copy of this module.
 *
 * Structural: the shared brand plus the `type` and `marshal` every instance carries.
 */
export const isResilientError = (value: unknown): value is ResilientError => {
  if (value == null || typeof value !== 'object') {
    return false
  }
  const candidate = value as { [RESILIENT_BRAND]?: unknown, type?: unknown, marshal?: unknown }

  return candidate[RESILIENT_BRAND] === true
    && typeof candidate.type === 'string'
    && typeof candidate.marshal === 'function'
}

export class ResilientError extends Error {
  public static separator: string = SEPARATOR

  public static typeName: string = RESILENT_ERROR

  public static converters: Converter[] = sharedConverters()

  /**
   * `instanceof` that holds across module copies.
   *
   * The native prototype check answers first. Failing that, a branded instance matches when its
   * class lineage ENDS WITH this class's lineage — the same own type names, in the same order, up
   * to the base. So `instanceof AuthFailedError` accepts an `AuthFailedError` (or a subclass of it)
   * from another copy, and never a sibling class or a parent. A class that does not declare its
   * own `typeName` cannot be told apart structurally and answers natively only.
   */
  public static override [Symbol.hasInstance]<T extends abstract new (...args: any[]) => any>(
    this: T, instance: unknown
  ): instance is InstanceType<T> {
    if (Function.prototype[Symbol.hasInstance].call(this, instance)) {
      return true
    }
    if (!isResilientError(instance) || !Object.prototype.hasOwnProperty.call(this, 'typeName')) {
      return false
    }
    const expected = lineageOf(this)
    const actual = lineageOf(Object.getPrototypeOf(instance)?.constructor)
    const offset = actual.length - expected.length

    return offset >= 0 && expected.every((name, index) => actual[offset + index] === name)
  }

  public static registerErrorClass(resilientErrorClass: ResilientErrorConstructor, errorClass?: ErrorConstructor): Converter {
    const converter = createErrorConverter(resilientErrorClass, errorClass)
    this.converters.push(converter)

    return converter
  }

  public static ensure(err: Error | string, throwOnUnknown?: boolean): ResilientError {
    err = typeof err === 'string' ? new Error(err) : err
    if (isResilientError(err)) {
      return err
    }

    // We don't proceed SyntaxError - system should crash in this case
    if (err instanceof SyntaxError) {
      throw err
    }

    // Umarshal marhalled error that is wrapepd to ordinary error
    const unmarhaller = this.converters.toReversed().find(converter => converter.isMarshaled(err))
    if (unmarhaller != null) {
      return unmarhaller.unmarshal(err)
    }

    // Convert object of Error subtypes to ResilientError subtype
    const converter = this.converters.find(converter => converter.match(err))
    if (converter != null) {
      return converter.convert(err)
    }

    if (throwOnUnknown === true) {
      throw err
    }

    return new ResilientError(this.typeName, err.message, err.stack)
  }

  public static marshal(err: Error, opts?: MarshalErrorOptions): Error {
    const resilient = isResilientError(err)
    const structuralType = (err as Error & { type?: unknown }).type
    const type = resilient
      ? err.type
      : typeof structuralType === 'string' ? structuralType : this.typeName
    const stack = opts?.includeStack === false
      ? ''
      : resilient ? err.oiriginalStack : err.stack
    const fields: Array<string | undefined> = [type, err.message, stack]
    if (opts?.incidentId != null) {
      fields.push(opts.incidentId)
    }

    return new Error(fields.join(this.separator))
  }

  public type: string = RESILENT_ERROR

  public oiriginalStack?: string

  /** Correlates a serialized boundary error with the server log entry that owns its full stack. */
  public incidentId?: string

  constructor(type: string, message: string, stack?: string) {
    super(message)
    this.type = type
    if (stack != null) {
      this.oiriginalStack = stack
    } else {
      this.oiriginalStack = this.stack
    }
  }

  marshal(opts?: MarshalErrorOptions): Error {
    return ResilientError.marshal(this, opts)
  }

  finalizeUnmarshal(): void { }
}

// On the prototype, not the instance: non-enumerable, and inherited by every subclass of this copy.
Object.defineProperty(ResilientError.prototype, RESILIENT_BRAND, { value: true })

// One catch-all per process: a second module copy finds the first copy's entry and adds none.
if (!ResilientError.converters.some(converter => (converter as { [CATCH_ALL_CONVERTER]?: unknown })[CATCH_ALL_CONVERTER] === true)) {
  ResilientError.converters.push(Object.assign({
    ...createErrorConverter(ResilientError as ResilientErrorConstructor),
    match: () => true,
  }, { [CATCH_ALL_CONVERTER]: true }))
}
