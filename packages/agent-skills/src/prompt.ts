import { createInterface, type Interface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { PromptUtils } from './prompt/types.js'

export const createPromptUtils = (): PromptUtils => {
  let rl: Interface | null = null

  const getReadline = (): Interface => {
    if (rl == null) {
      rl = createInterface({ input: stdin, output: stdout })
    }
    return rl
  }

  const closeReadline = (): void => {
    if (rl != null) {
      rl.close()
      rl = null
    }
  }

  const confirm = async (question: string): Promise<boolean> => {
    const answer = await getReadline().question(`${question} [y/N] `)
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes'
  }

  const isTTY = (): boolean => process.stdin.isTTY === true

  return { closeReadline, confirm, isTTY }
}

export const promptUtils = createPromptUtils()
