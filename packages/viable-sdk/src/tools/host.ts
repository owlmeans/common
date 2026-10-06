import { ToolHostKind } from './consts.js'
import type { ToolHost } from './types.js'
import type { ToolHostHelper } from './host/types.js'

export const createToolHostHelper = (): ToolHostHelper => {
  const anyHost = (): boolean => true

  const localTarget = (host: ToolHost): boolean => host.target === 'local'

  const cloudTarget = (host: ToolHost): boolean => host.target === 'cloud'

  const withExecutor = (host: ToolHost): boolean => host.hasExecutor

  const delegatedLlm = (host: ToolHost): boolean => host.llm === 'local'

  const sessionCapable = (host: ToolHost): boolean => host.kind === ToolHostKind.Stdio

  const performsModelTasks = (host: ToolHost): boolean =>
    delegatedLlm(host) && sessionCapable(host)

  return { anyHost, localTarget, cloudTarget, withExecutor, delegatedLlm, sessionCapable, performsModelTasks }
}

export const toolHostHelper = createToolHostHelper()
