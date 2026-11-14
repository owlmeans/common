/** Every link key, in the order the file writes them. */
export const LINK_KEY_ORDER = [
  'id', 'url', 'normalized', 'intents', 'own', 'instruction', 'origin', 'status', 'reason', 'folder', 'files', 'bytes', 'docs',
] as const

/** Every research key, in the order the file writes them. */
export const RESEARCH_KEY_ORDER = [
  'id', 'query', 'instruction', 'origin', 'status', 'reason', 'doc', 'sources', 'gap',
] as const

/** Every package key, in the order the file writes them. */
export const PACKAGE_KEY_ORDER = [
  'name', 'origin', 'verdict', 'reasons', 'lookalikeOf', 'skill', 'status', 'reason',
] as const

/** The two FNV-1a lanes a stable id digests with: the standard offset basis and a second one. */
export const ID_LANES = [0x811c9dc5, 0x050c5d1f] as const
export const FNV_PRIME = 0x01000193
