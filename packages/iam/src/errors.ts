import { ResilientError } from '@owlmeans/error'

export class IamError extends ResilientError {
  public static override typeName = `Iam${ResilientError.typeName}`

  constructor(message = 'error') {
    super(IamError.typeName, `iam:${message}`)
    this.type = IamError.typeName
  }
}

export class IamClientError extends IamError {
  public static override typeName = `IamClient${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`client:${message}`)
    this.type = IamClientError.typeName
  }
}

export class IamResourceError extends IamError {
  public static override typeName = `IamResource${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`resource:${message}`)
    this.type = IamResourceError.typeName
  }
}

export class IamGrantError extends IamError {
  public static override typeName = `IamGrant${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`grant:${message}`)
    this.type = IamGrantError.typeName
  }
}

/**
 * A refusal about a permission DEFINITION, as opposed to a grant.
 *
 * Separate from `IamGrantError`, which means a grant's subject is missing or its entity does not
 * match — reusing it for a definition-level refusal is a category error the next reader has to unpick.
 *
 * Codes: `permission:held:<name>` (still granted to someone, under a policy that refuses),
 * `permission:managed:<name>` (platform-owned, deleted only with an explicit second key).
 */
export class IamPermissionError extends IamError {
  public static override typeName = `IamPermission${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`permission:${message}`)
    this.type = IamPermissionError.typeName
  }
}

export class IamUnsupported extends IamError {
  public static override typeName = `IamUnsupported${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`unsupported:${message}`)
    this.type = IamUnsupported.typeName
  }
}

export class IamUserError extends IamError {
  public static override typeName = `IamUser${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`user:${message}`)
    this.type = IamUserError.typeName
  }
}

/**
 * A refusal about an organization or a membership in it — an unknown organization, the last owner,
 * the membership cap.
 */
export class IamOrganizationError extends IamError {
  public static override typeName = `IamOrganization${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`organization:${message}`)
    this.type = IamOrganizationError.typeName
  }
}

/** A refusal about a group: an unknown key, a managed group written by an operator, another app's group. */
export class IamGroupError extends IamError {
  public static override typeName = `IamGroup${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`group:${message}`)
    this.type = IamGroupError.typeName
  }
}

ResilientError.registerErrorClass(IamError)
ResilientError.registerErrorClass(IamClientError)
ResilientError.registerErrorClass(IamResourceError)
ResilientError.registerErrorClass(IamGrantError)
ResilientError.registerErrorClass(IamPermissionError)
ResilientError.registerErrorClass(IamUnsupported)
ResilientError.registerErrorClass(IamUserError)
ResilientError.registerErrorClass(IamOrganizationError)
ResilientError.registerErrorClass(IamGroupError)
