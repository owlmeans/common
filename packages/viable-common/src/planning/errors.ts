import { ResilientError } from '@owlmeans/error'
import { ResourceError } from '@owlmeans/resource'

/**
 * The project and story refusals every process that writes a planning card can raise.
 *
 * Declared HERE rather than by the platform because the viable planning plugin throws them from a
 * process-neutral package, and a refusal class that exists only on one side of a hop cannot be
 * `instanceof`-matched on the other. Type names and markers are wire contracts: the browser
 * phrases a refusal by marker (`viable-project:…`), so neither may change. The bases are declared
 * with them because an error class is unmarshalled by type name with the LAST registration
 * winning — a second declaration of a base anywhere else would replace this one.
 */
export class ProjectResourceError extends ResourceError {
  public static override typeName = `ViableProject${ResourceError.typeName}`

  constructor(message: string = 'error') {
    super(`viable-project:${message}`)
    this.type = ProjectResourceError.typeName
  }
}

/** No project card with that id in the caller's organization. */
export class ProjectNotFound extends ProjectResourceError {
  public static override typeName = `NotFound${ProjectResourceError.typeName}`
  /** The addressed project is absent or another organization's: answered 404. */
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`not-found:${message}`)
    this.type = ProjectNotFound.typeName
  }
}

/** The project exists, and the caller may not act on it. */
export class ProjectPermissionError extends ProjectResourceError {
  public static override typeName = `Permission${ProjectResourceError.typeName}`

  constructor(message: string = 'error') {
    super(`permission:${message}`)
    this.type = ProjectPermissionError.typeName
  }
}

export class ProjectStoryError extends ProjectResourceError {
  public static override typeName = `Story${ProjectResourceError.typeName}`

  constructor(message: string = 'error') {
    super(`story:${message}`)
    this.type = ProjectStoryError.typeName
  }
}

/** No story card with that id or code under the project. */
export class ProjectStoryNotFound extends ProjectStoryError {
  public static override typeName = `NotFound${ProjectStoryError.typeName}`
  /** The addressed story is absent from the project: answered 404. */
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`not-found:${message}`)
    this.type = ProjectStoryNotFound.typeName
  }
}

/**
 * The story is in a state the requested write does not apply to.
 *
 * `wrong-status` is the marker a completed story's refusal carries — the manager matches the whole
 * `viable-project:story:missconfigured:` prefix, so the reason after it is free to grow.
 */
export class ProjectStoryMissconfigured extends ProjectStoryError {
  public static override typeName = `Missconfigured${ProjectStoryError.typeName}`
  /** The story's current state does not take the write: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`missconfigured:${message}`)
    this.type = ProjectStoryMissconfigured.typeName
  }
}

export class ProjectError extends ResilientError {
  public static override typeName = `ViableProject${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(ProjectError.typeName, `viable-project:${message}`)
  }
}

export class ProjectAgentError extends ProjectError {
  public static override typeName = `Agent${ProjectError.typeName}`

  constructor(message: string = 'error') {
    super(`agent:${message}`)
    this.type = ProjectAgentError.typeName
  }
}

/**
 * The project's agent is already busy with what was asked for.
 *
 * `story` is the reason a second story start carries: one story of a project is in progress at a
 * time, because a develop run holds the project's sandbox for its whole length.
 */
export class ProjectAgentOccupied extends ProjectAgentError {
  public static override typeName = `Occupied${ProjectAgentError.typeName}`
  /** The project's agent is busy with the same kind of work: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`occupied:${message}`)
    this.type = ProjectAgentOccupied.typeName
  }
}

ResilientError.registerErrorClass(ProjectResourceError)
ResilientError.registerErrorClass(ProjectNotFound)
ResilientError.registerErrorClass(ProjectPermissionError)
ResilientError.registerErrorClass(ProjectStoryError)
ResilientError.registerErrorClass(ProjectStoryNotFound)
ResilientError.registerErrorClass(ProjectStoryMissconfigured)
ResilientError.registerErrorClass(ProjectError)
ResilientError.registerErrorClass(ProjectAgentError)
ResilientError.registerErrorClass(ProjectAgentOccupied)
