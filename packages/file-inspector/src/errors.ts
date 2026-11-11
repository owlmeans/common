import { ResilientError } from '@owlmeans/error'
import { FileTypeError } from '@owlmeans/storage-common'

export class FileInspectorError extends ResilientError {
  public static override typeName: string = 'FileInspectorError'

  constructor(message: string = 'error') {
    super(FileInspectorError.typeName, `file-inspector:${message}`)
  }
}

/**
 * A probe's byte budget reached. Internal to a probe: the verdict reports it as the `probe-budget`
 * reason, a probe never rejects with it.
 */
export class ProbeBudgetError extends FileInspectorError {
  public static override typeName: string = `${FileInspectorError.typeName}ProbeBudget`

  constructor(message: string = 'probe-budget') {
    super(message)
    this.type = ProbeBudgetError.typeName
  }
}

/** Content that is not what its name or declared type claims, or dangerous content. A storage `FileTypeError`. */
export class FileMimicryError extends FileTypeError {
  public static override typeName: string = `${FileTypeError.typeName}Mimicry`

  constructor(message: string = 'error') {
    super(`mimicry:${message}`)
    this.type = FileMimicryError.typeName
  }
}

/** Content of a kind the verify policy does not allow or refuses. A storage `FileTypeError`. */
export class FileKindError extends FileTypeError {
  public static override typeName: string = `${FileTypeError.typeName}Kind`

  constructor(message: string = 'error') {
    super(`kind:${message}`)
    this.type = FileKindError.typeName
  }
}

ResilientError.registerErrorClass(FileInspectorError)
ResilientError.registerErrorClass(ProbeBudgetError)
ResilientError.registerErrorClass(FileMimicryError)
ResilientError.registerErrorClass(FileKindError)
