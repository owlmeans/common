import { ResilientError } from '@owlmeans/error'

export class PackageInspectorError extends ResilientError {
  public static override typeName: string = 'PackageInspectorError'

  constructor(message: string = 'error') {
    super(PackageInspectorError.typeName, `package-inspector:${message}`)
  }
}

/**
 * A registry (or a repository host) that could not be asked: a failure status, a timeout, an
 * unreadable answer. An adapter throws it with `<registry>:<what>:<subject>:<cause>`; a missing
 * package is never an error, it is `null`.
 */
export class PackageRegistryError extends PackageInspectorError {
  public static override typeName: string = `${PackageInspectorError.typeName}Registry`

  constructor(message: string = 'error') {
    super(`registry:${message}`)
    this.type = PackageRegistryError.typeName
  }
}

ResilientError.registerErrorClass(PackageInspectorError)
ResilientError.registerErrorClass(PackageRegistryError)
