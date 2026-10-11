/**
 * What an error class may declare about the HTTP status it is answered with.
 *
 * Structural on purpose: the classes that declare it live in packages that must not depend on an
 * HTTP server (`@owlmeans/payment`, a product's contract package), so they write a plain
 * `public static httpStatus = 409` and nothing imports this type.
 */
export interface HttpStatusDeclaration {
  httpStatus?: unknown
  /** Explicit opt-in for a declared 5xx response. Client-error declarations need no opt-in. */
  allowServerErrorStatus?: unknown
}

export interface SerializedHttpError {
  status: number
  body: string
  incidentId: string
}
