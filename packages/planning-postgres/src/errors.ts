import { ResilientError } from '@owlmeans/error'

/**
 * A fault of the Postgres planning store — a missing resource, a fold transaction that could not
 * commit. Messages start with `planning-postgres:`; it declares no HTTP status (a fault answers 500).
 */
export class PlanningPostgresError extends ResilientError {
  public static override typeName: string = 'PlanningPostgresError'

  constructor(message: string = 'error') {
    super(PlanningPostgresError.typeName, `planning-postgres:${message}`)
  }
}

ResilientError.registerErrorClass(PlanningPostgresError)
