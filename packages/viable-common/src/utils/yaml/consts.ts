/** A frontmatter block: the fenced YAML at the very top of a markdown document. */
export const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export const YAML_NULLS: readonly string[] = ['~', 'null', 'Null', 'NULL']
export const YAML_TRUES: readonly string[] = ['true', 'True', 'TRUE']
export const YAML_FALSES: readonly string[] = ['false', 'False', 'FALSE']

export const YAML_INT = /^[-+]?[0-9]+$/
export const YAML_OCTAL = /^0o[0-7]+$/
export const YAML_HEX = /^0x[0-9a-fA-F]+$/
export const YAML_FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/

/** Characters a plain scalar may not start with in the subset (anchors, aliases, tags, directives, reserved). */
export const YAML_UNSUPPORTED_STARTS: readonly string[] = ['&', '*', '!', '%', '@', '`', '?']

/** The double-quoted escapes the subset understands. */
export const YAML_ESCAPES: Readonly<Record<string, string>> = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: ' ', P: ' ',
}
