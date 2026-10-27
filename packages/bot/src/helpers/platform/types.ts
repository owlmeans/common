import type { BotActionKind, BotPlatform } from '../../consts.js'

/** What a connection on a platform can do, given which of its credentials hold a value. */
export interface BotPlatformHelper {
  /**
   * The descriptor's actions, plus those an optional credential `enables` when its key is in
   * `credentialsSet` (Slack's `userToken` → `delete`), plus `note`, which every connection supports.
   */
  actionsOf: (platform: BotPlatform, credentialsSet?: readonly string[]) => BotActionKind[]
  /** Whether {@link BotPlatformHelper.actionsOf} includes `kind`. */
  supports: (platform: BotPlatform, kind: BotActionKind, credentialsSet?: readonly string[]) => boolean
}
