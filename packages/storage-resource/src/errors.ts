import { ResilientError } from '@owlmeans/error'

export class StoredFileError extends ResilientError {
  public static override typeName: string = 'StoredFileError'

  constructor(message: string = 'error') {
    super(StoredFileError.typeName, `stored-file:${message}`)
  }
}

export class OrphanFileError extends StoredFileError {
  public static override typeName: string = `${StoredFileError.typeName}Orphan`

  constructor(message: string = 'error') {
    super(`orphan:${message}`)
    this.type = OrphanFileError.typeName
  }
}

ResilientError.registerErrorClass(StoredFileError)
ResilientError.registerErrorClass(OrphanFileError)
