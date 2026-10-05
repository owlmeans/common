import { TARGET_API_PORT } from '@owlmeans/viable-common'

import { spawnHelper } from '../executor/spawn.js'
import type { LocalProcessRecord, LocalRunRecord } from './types.js'
import type { RunProcessHelper } from './process/types.js'

export const createRunProcessHelper = (): RunProcessHelper => {
  const apiRunning = (record: LocalRunRecord | null): boolean =>
    record != null && spawnHelper.isAlive(record.api?.pid)

  const stopProcess = async (record: LocalProcessRecord | undefined): Promise<void> => {
    if (record == null) return

    if (spawnHelper.isAlive(record.pid)) {
      spawnHelper.signalGroup(record.pid, 'SIGTERM')
      if (!await spawnHelper.waitForPortFree(record.port, 5_000)) {
        spawnHelper.signalGroup(record.pid, 'SIGKILL')
      }
    }
    await spawnHelper.waitForPortFree(record.port, 5_000)
  }

  const apiListening = async (
    port: number = TARGET_API_PORT
  ): Promise<boolean> => await spawnHelper.probeListening(port)

  return { apiRunning, stopProcess, apiListening }
}

export const runProcessHelper = createRunProcessHelper()
