import { spawn } from 'node:child_process'

const COMMAND_BY_PLATFORM: Record<string, string> = {
  darwin: 'open',
  win32: 'start',
  linux: 'xdg-open',
}

/**
 * Best-effort: open `url` in the person's default browser. `false` on any failure — a CLI whose
 * whole job is print-a-URL-and-poll must still work over SSH, in a container, or on a platform
 * this never learned to open a browser on, so a failure here is never fatal to the caller.
 *
 * Spawned detached and with every std stream ignored, because this process's stdout may be
 * carrying a protocol (an MCP server's JSON-RPC stream) that nothing the opened program writes may
 * ever reach.
 */
export const openBrowser = (url: string, env: NodeJS.ProcessEnv = process.env): boolean => {
  const platform = process.platform
  const command = COMMAND_BY_PLATFORM[platform]
  if (command == null) return false
  // `BROWSER=none` is the convention other CLIs already honour; the dedicated variable is for
  // automation (an end-to-end run drives the page itself and must not pop a window on a desktop).
  if (env.OWLMEANS_NO_BROWSER === '1' || env.BROWSER === 'none') return false
  // A Linux session with no display (SSH, a container) has nothing for `xdg-open` to talk to.
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false

  try {
    const child = platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true })
      : spawn(command, [url], { detached: true, stdio: 'ignore' })

    child.on('error', () => undefined) // a listener is required or Node throws on the next tick
    child.unref()

    return true
  } catch {
    return false
  }
}
