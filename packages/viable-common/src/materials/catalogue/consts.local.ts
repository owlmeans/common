/** The frontmatter fence: a line holding exactly this. */
export const FRONTMATTER_FENCE = '---'

/** Every entry key, in the order the frontmatter writes them. */
export const ENTRY_KEY_ORDER = [
  'path', 'name', 'size', 'mime', 'kind', 'digest', 'from', 'status', 'reason', 'purpose',
  'description', 'details', 'uses', 'transcript', 'placedAt',
] as const

/** Every use key, in the order the frontmatter writes them. */
export const USE_KEY_ORDER = ['target', 'by', 'source', 'note'] as const

export const INDEX_TITLE = '# Project materials'

export const INDEX_INTRO = 'Files attached to the project when it was created, catalogued by purpose. '
  + 'The JSON block above is the machine copy of this table.'

export const INDEX_EMPTY = '_No materials._'

export const TABLE_HEAD = '| File | Purpose | Type | Size | Status | Uses | Description |'

export const TABLE_RULE = '| --- | --- | --- | --- | --- | --- | --- |'

/**
 * What must stand right before and right after a name for it to count as mentioned: no name
 * character before it, and after it neither a name character nor a dot that continues the name —
 * so `logo.svg` is mentioned in "use logo.svg." and not in "biglogo.svg" or "logo.svg.bak".
 */
export const MENTION_BEFORE = '(^|[^A-Za-z0-9_.-])'
export const MENTION_AFTER = '(?![A-Za-z0-9_-]|\\.[A-Za-z0-9])'

export const SIZE_UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const
