/** How long one connect may take before the address counts as unreachable. */
export const CONNECT_TIMEOUT_MS = 1_500

/** The probe runs in a child process; this covers its own startup on a loaded machine. */
export const SPAWN_GRACE_MS = 5_000

// Runs under whichever runtime runs the suite (`process.execPath`), so it is plain CommonJS
// that both `bun -e` and `node -e` evaluate.
export const PROBE_SCRIPT = `
const net = require('net')
const [targets, timeout] = JSON.parse(process.env.OWLMEANS_TEST_PROBE)
let pending = targets.length
let last = ''
for (const target of targets) {
  let settled = false
  const socket = net.connect({ host: target.host, port: target.port })
  const fail = code => {
    if (settled) return
    settled = true
    socket.destroy()
    last = code
    if (--pending === 0) { process.stdout.write(last); process.exit(1) }
  }
  socket.setTimeout(timeout)
  socket.once('connect', () => process.exit(0))
  socket.once('timeout', () => fail('ETIMEDOUT'))
  socket.once('error', error => fail(error.code || String(error)))
}
`
