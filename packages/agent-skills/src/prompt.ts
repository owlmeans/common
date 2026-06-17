import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

let rl: ReturnType<typeof createInterface> | null = null

const getReadline = (): ReturnType<typeof createInterface> => {
  if (rl == null) {
    rl = createInterface({ input: stdin, output: stdout })
  }
  return rl
}

export const closeReadline = (): void => {
  if (rl != null) {
    rl.close()
    rl = null
  }
}

export const confirm = async (question: string): Promise<boolean> => {
  const answer = await getReadline().question(`${question} [y/N] `)
  return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes'
}

export const isTTY = (): boolean => process.stdin.isTTY === true
