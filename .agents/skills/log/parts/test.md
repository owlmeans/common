---
name: test
description: Testing with memoryPlugin and resetLog, and quieting a noisy test without replacing console methods.
metadata:
  purposes: test
  mentions: memoryPlugin, resetLog, configureLog
---

# @owlmeans/log — Testing

## Test with it

```ts
const memory = memoryPlugin()
addLogPlugin(memory)
logger('x').warn('boom', { id: 1 })
expect(memory.records[0]).toMatchObject({ level: 'warn', scope: 'x', data: { id: 1 } })
resetLog()           // restores the console, drops plugins, back to the defaults
```

`configureLog({ level: 'silent' })` quiets a noisy test; do not replace `console.*` methods — the sink
writes through captured natives, so it would not see them.
