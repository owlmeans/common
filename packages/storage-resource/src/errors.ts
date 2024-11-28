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

export class FilePropertyError extends StoredFileError {
  public static override typeName: string = `${StoredFileError.typeName}Property`

  constructor(message: string = 'error') {
    super(`property:${message}`)
    this.type = FilePropertyError.typeName
  }
}

export class FileStreamError extends FilePropertyError {
  public static override typeName: string = `${StoredFileError.typeName}FileStream`

  constructor(message: string = 'error') {
    super(`creation:${message}`)
    this.type = FileStreamError.typeName
  }
}


export class StorageApiError extends StoredFileError {
  public static override typeName: string = `${StoredFileError.typeName}Api`

  constructor(message: string = 'error') {
    super(`api:${message}`)
    this.type = StorageApiError.typeName
  }
}

ResilientError.registerErrorClass(StoredFileError)
ResilientError.registerErrorClass(OrphanFileError)
ResilientError.registerErrorClass(FilePropertyError)
ResilientError.registerErrorClass(FileStreamError)
ResilientError.registerErrorClass(StorageApiError)
