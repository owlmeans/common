/** The aliases one managing tree answers under — every one derived from the mount's base alias. */
export interface BotAliases {
  readonly base: string
  readonly connection: {
    readonly list: string
    readonly save: string
    readonly verify: string
    readonly remove: string
    readonly simulate: string
  }
  readonly rule: { readonly list: string, readonly save: string, readonly remove: string }
  readonly activity: { readonly list: string }
}

export interface BotHookAliases {
  readonly base: string
  readonly receive: string
  readonly challenge: string
}

export interface BotAliasUtils {
  /** Two mounts in one deployment are two base aliases, never two copies of a table. */
  botAliases: (base: string) => BotAliases
  botHookAliases: (base: string) => BotHookAliases
}
