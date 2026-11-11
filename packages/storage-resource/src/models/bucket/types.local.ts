/** What an S3 SDK rejection carries: a service error's code as its name, a network error's `code`. */
export interface S3Failure {
  name?: string
  Code?: string
  code?: string
  $metadata?: { httpStatusCode?: number }
}
