#!/usr/bin/env node
import { parseArgs, printHelp } from './args.js'
import { run } from './run.js'

const args = parseArgs(process.argv)

if (args == null) {
  process.stderr.write('Run with --help for usage.\n')
  process.exit(2)
} else if (args.help) {
  printHelp()
  process.exit(0)
} else {
  run(args).then(code => {
    process.exit(code)
  }).catch((err: unknown) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
