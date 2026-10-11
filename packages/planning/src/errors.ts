import { ResilientError } from '@owlmeans/error'

/**
 * The planning refusal family.
 *
 * Every message starts with `planning:` followed by the class's own marker (`workcard-not-found:`,
 * `illegal-transition:` …) and the detail. The marker is what survives a hop where the class is not
 * registered, so it is part of the contract, not decoration.
 */
export class PlanningError extends ResilientError {
  public static override typeName: string = 'PlanningError'

  constructor(message: string = 'error') {
    super(PlanningError.typeName, `planning:${message}`)
  }
}

/** The card does not exist — or belongs to another entity, which is deliberately the same answer. */
export class WorkcardNotFound extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}WorkcardNotFound`
  /** The addressed card is absent or another entity's: answered 404. */
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`workcard-not-found:${message}`)
    this.type = WorkcardNotFound.typeName
  }
}

export class UnknownWorkcardType extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}UnknownWorkcardType`
  /** The execution names a type the registry does not declare: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`unknown-type:${message}`)
    this.type = UnknownWorkcardType.typeName
  }
}

export class UnknownStatusFlow extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}UnknownStatusFlow`
  /** The execution names a flow the type does not run: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`unknown-flow:${message}`)
    this.type = UnknownStatusFlow.typeName
  }
}

export class ParentNotFound extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}ParentNotFound`
  /** A parent the body references does not resolve: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`parent-not-found:${message}`)
    this.type = ParentNotFound.typeName
  }
}

/** The parent project's type does not list this card (or project) type. */
export class CardTypeNotAllowed extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}CardTypeNotAllowed`
  /** The parent refuses a child of this type: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`card-type-not-allowed:${message}`)
    this.type = CardTypeNotAllowed.typeName
  }
}

/** A plugin's `before` middleware refused the execution without a class of its own. */
export class PlanningRefused extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}Refused`
  /** A plugin refused what was submitted: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`refused:${message}`)
    this.type = PlanningRefused.typeName
  }
}

/** The flow offers no rule of that name from the card's current status. */
export class IllegalTransition extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}IllegalTransition`
  /** The card's current status offers no such rule: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`illegal-transition:${message}`)
    this.type = IllegalTransition.typeName
  }
}

export class FieldsInvalid extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}FieldsInvalid`
  /** The submitted fields fail the type's schema: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`fields-invalid:${message}`)
    this.type = FieldsInvalid.typeName
  }
}

export class LabelNotAllowed extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}LabelNotAllowed`
  /** The submitted label is refused: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`label-not-allowed:${message}`)
    this.type = LabelNotAllowed.typeName
  }
}

export class SpecificationSlotUnknown extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}SpecificationSlotUnknown`
  /** The body names a slot the parent type does not declare: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`specification-slot-unknown:${message}`)
    this.type = SpecificationSlotUnknown.typeName
  }
}

/** A second document for a slot that holds one — revise the existing record instead. */
export class SpecificationRevisionConflict extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}SpecificationRevisionConflict`
  /** The slot already holds its document: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`specification-revision-conflict:${message}`)
    this.type = SpecificationRevisionConflict.typeName
  }
}

export class RelationshipRefused extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}RelationshipRefused`
  /** The submitted link is refused: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`relationship-refused:${message}`)
    this.type = RelationshipRefused.typeName
  }
}

export class CodeTaken extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}CodeTaken`
  /** Another card holds the code: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`code-taken:${message}`)
    this.type = CodeTaken.typeName
  }
}

/** `expectSeq` no longer matches the card's head — somebody else wrote first. Re-read and retry. */
export class WorkcardConflict extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}WorkcardConflict`
  /** The card moved past the expected head: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`workcard-conflict:${message}`)
    this.type = WorkcardConflict.typeName
  }
}

/** The transition was appended but did not commit in time. It stays pending — nothing is undone. */
export class CommitTimeout extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}CommitTimeout`

  constructor(message: string = 'error') {
    super(`commit-timeout:${message}`)
    this.type = CommitTimeout.typeName
  }
}

export class CommitFailed extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}CommitFailed`

  constructor(message: string = 'error') {
    super(`commit-failed:${message}`)
    this.type = CommitFailed.typeName
  }
}

/** A card of another entity was addressed. Handlers answer it as {@link WorkcardNotFound}. */
export class PlanningScopeMismatch extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}ScopeMismatch`
  /** Another entity's card, answered as absent: answered 404. */
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`scope-mismatch:${message}`)
    this.type = PlanningScopeMismatch.typeName
  }
}

/**
 * A data-defined schema write lost its compare-and-set: the layer's record is not at the version
 * the write replaces. Re-read the layer and retry.
 */
export class SchemaConflict extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}SchemaConflict`
  /** The stored record moved past the expected version: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`schema-conflict:${message}`)
    this.type = SchemaConflict.typeName
  }
}

/** A flow cannot be retired while a live type of an affected layer still resolves it. */
export class SchemaInUse extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}SchemaInUse`
  /** Other declarations still depend on the key: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`schema-in-use:${message}`)
    this.type = SchemaInUse.typeName
  }
}

/**
 * The key is registered in code and does not declare itself `overridable` — or it is a project
 * or specification type, which only code declares.
 */
export class SchemaSealed extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}SchemaSealed`
  /** The key cannot be declared as data: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`schema-sealed:${message}`)
    this.type = SchemaSealed.typeName
  }
}

/** A data-defined declaration fails its closed-form checks. */
export class SchemaInvalid extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}SchemaInvalid`
  /** The declaration's content is refused: answered 422. */
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`schema-invalid:${message}`)
    this.type = SchemaInvalid.typeName
  }
}

/** The request's access does not grant the write (creating or deleting a project, defining schemas). */
export class PlanningForbidden extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}Forbidden`
  /** The caller lacks the grant the write needs: answered 403. */
  public static httpStatus = 403

  constructor(message: string = 'error') {
    super(`forbidden:${message}`)
    this.type = PlanningForbidden.typeName
  }
}

/** The store behind this type cannot do what was asked (a foreign provider without a log). */
export class PlanningUnsupported extends PlanningError {
  public static override typeName: string = `${PlanningError.typeName}Unsupported`

  constructor(message: string = 'error') {
    super(`unsupported:${message}`)
    this.type = PlanningUnsupported.typeName
  }
}

ResilientError.registerErrorClass(PlanningError)
ResilientError.registerErrorClass(WorkcardNotFound)
ResilientError.registerErrorClass(UnknownWorkcardType)
ResilientError.registerErrorClass(UnknownStatusFlow)
ResilientError.registerErrorClass(ParentNotFound)
ResilientError.registerErrorClass(CardTypeNotAllowed)
ResilientError.registerErrorClass(PlanningRefused)
ResilientError.registerErrorClass(IllegalTransition)
ResilientError.registerErrorClass(FieldsInvalid)
ResilientError.registerErrorClass(LabelNotAllowed)
ResilientError.registerErrorClass(SpecificationSlotUnknown)
ResilientError.registerErrorClass(SpecificationRevisionConflict)
ResilientError.registerErrorClass(RelationshipRefused)
ResilientError.registerErrorClass(CodeTaken)
ResilientError.registerErrorClass(WorkcardConflict)
ResilientError.registerErrorClass(CommitTimeout)
ResilientError.registerErrorClass(CommitFailed)
ResilientError.registerErrorClass(PlanningScopeMismatch)
ResilientError.registerErrorClass(SchemaConflict)
ResilientError.registerErrorClass(SchemaInUse)
ResilientError.registerErrorClass(SchemaSealed)
ResilientError.registerErrorClass(SchemaInvalid)
ResilientError.registerErrorClass(PlanningForbidden)
ResilientError.registerErrorClass(PlanningUnsupported)
