import type { BotActionKind } from '../../consts.js'
import type { BotPlatformDescriptor } from '../../types.js'

/** What a connection on a platform can do, given the platform's descriptor and which credentials hold a value. */
export interface BotPlatformHelper {
  /**
   * The descriptor's actions, plus those an optional credential `enables` when its key is in
   * `credentialsSet`, plus `note`, which every connection supports. No descriptor (a platform with
   * no plugin registered): `note` alone.
   */
  actionsOf: (descriptor: BotPlatformDescriptor | null | undefined, credentialsSet?: readonly string[]) => BotActionKind[]
  /** Whether {@link BotPlatformHelper.actionsOf} includes `kind`. */
  supports: (
    descriptor: BotPlatformDescriptor | null | undefined, kind: BotActionKind, credentialsSet?: readonly string[]
  ) => boolean
}
