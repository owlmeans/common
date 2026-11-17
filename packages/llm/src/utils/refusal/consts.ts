/** How many schema errors the default correction lists. */
export const MAX_CORRECTION_ERRORS = 8

/** How much of the refused answer one listed error quotes, in characters of JSON. */
export const MAX_FRAGMENT_CHARS = 600

/** How many schema errors a `validation-failed:` message carries; `details` keeps them all. */
export const VALIDATION_SUMMARY_ERRORS = 3

export const CORRECTION_HEADER = 'Your previous answer does not match the required JSON schema:'

export const CORRECTION_VALUE_LABEL = 'Your value:'

export const CORRECTION_INSTRUCTION = 'Return the whole answer again, corrected. If a required value cannot be given truthfully, '
  + 'leave out the optional object that holds it, or answer null where null is allowed.'

/** How the default correction names the root of the answer. */
export const ROOT_PATH_LABEL = '(root)'

/** The reason a refused attempt reports when its filter refused it. */
export const FILTER_REJECTED = 'filter-rejected'

/** The reason a refused attempt reports when the schema refused it. */
export const VALIDATION_FAILED = 'validation-failed'
