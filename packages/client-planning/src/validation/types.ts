export interface PlanningFieldError {
  /** Decoded field path; a required-property error includes the missing property's name. */
  path: string
  keyword: string
  schemaPath: string
  /** A bounded explanation which does not include the submitted value. */
  message: string
}

export interface PlanningFieldValidation {
  valid: boolean
  errors: PlanningFieldError[]
}

export interface PlanningFieldValidator {
  /** Validate without coercion, defaults, removal, code generation or network reference loading. */
  validateFields: (fields: Record<string, unknown>) => PlanningFieldValidation
}
