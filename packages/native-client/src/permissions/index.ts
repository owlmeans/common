import type { AppContext } from '../types.js'
import { STAB_PLUGIN } from './consts.js'
import { createStubPlugin } from './stab.js'
import type { PermissionServicePlugin } from './types.js'
import { createIosPlugin } from './ios.js'
import { createAndroidPlugin } from './android.js'

export const plugins: { [key: string]: (context: AppContext) => PermissionServicePlugin } = {
  [STAB_PLUGIN]: createStubPlugin,
  ['ios']: createIosPlugin,
  ['android']: createAndroidPlugin
}
