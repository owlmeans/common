import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { findProcesses, killGroupAndWait, probeListening, waitForPortFree } from '../src/executor/spawn.js'

/** Composed at runtime, so this file's own text can never match a search for it. */
const marker = (suffix: string): string => ['--viable', 'spawn', 'spec', process.pid, suffix].join('-')

const groupAlive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0)

    return true
  } catch {
    return false
  }
}

const settle = async (ms: number): Promise<void> =>
  await new Promise(resolve => setTimeout(resolve, ms))

describe('what a connector leaves behind when it stops', () => {
  test('a shell-wrapped child is killed through its GROUP', async () => {
    // The child is a shell wrapping the real process, so a signal aimed at the shell alone leaves
    // what it started alive and holding the port.
    const child = spawn('sh', ['-c', 'sleep 120', marker('group')], { detached: true, stdio: 'ignore' })
    await settle(300)
    expect(groupAlive(child.pid!)).toBe(true)

    await killGroupAndWait(child, { term: 3_000, kill: 3_000 })

    expect(groupAlive(child.pid!)).toBe(false)
  }, 20_000)

  test('a child that ALREADY exited still has its group swept', async () => {
    // The documented trap: `exitCode` is about the shell, and an early return on it left a stray
    // server running on somebody's machine and every later boot check failing with "the api port
    // is already in use".
    const child = spawn('sh', ['-c', 'sleep 120 & exit 0', marker('orphan')], {
      detached: true, stdio: 'ignore',
    })
    await settle(500)

    expect(child.exitCode).not.toBeNull()
    expect(groupAlive(child.pid!)).toBe(true)

    await killGroupAndWait(child, { term: 2_000, kill: 2_000 })

    expect(groupAlive(child.pid!)).toBe(false)
  }, 20_000)

  test('a process is matched only when it carries EVERY needle', async () => {
    // A marker alone would match any command line that merely mentions it — a shell the user is
    // typing in, a grep, an editor — and reclaiming sends SIGKILL.
    const own = marker('needles')
    const child = spawn('sh', ['-c', 'sleep 120', `${own} dist/index.js`], {
      detached: true, stdio: 'ignore',
    })
    await settle(300)

    try {
      expect(await findProcesses([own, 'dist/index.js'])).toContain(child.pid!)
      expect(await findProcesses([own, 'not-in-that-command-line'])).toEqual([])
    } finally {
      await killGroupAndWait(child, { term: 2_000, kill: 2_000 })
    }
  }, 20_000)

  test('a free port is reported free without waiting out the budget', async () => {
    const started = Date.now()

    expect(await waitForPortFree(59_999, 5_000)).toBe(true)
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(await probeListening(59_999, 200)).toBe(false)
  }, 10_000)
})
