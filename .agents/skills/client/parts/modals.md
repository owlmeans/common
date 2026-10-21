---
name: modals
description: The modal service stack — the surface an app mounts once, ModalBodyProps bodies, request with response, cancel and error, and why the stack stays one deep.
metadata:
  purposes: dialog
  mentions: context.modal, ModalBodyProps, useSetupModalNavigator, appendModalService, createModalService, ModalService, ModalStackLayer, useToggle
---

# @owlmeans/client — Modals

## Modals

`context.modal()` owns a STACK of body components and one surface. The surface is a component the
app mounts once: it links a toggle to the service, reads the top layer through `layer()`, and
renders it with the service as a prop.

```tsx
import { useContext, useSetupModalNavigator, useToggle, useValue } from '@owlmeans/client'
import type { ModalBodyProps } from '@owlmeans/client'
import { useEffect } from 'react'
import type { FC } from 'react'

export const Modal: FC = () => {
  useSetupModalNavigator()                     // lets a body navigate; call it once
  const context = useContext()
  const toggle = useToggle(false)

  useEffect(() => {
    void context.waitForInitialized().then(() => context.modal().link(toggle))
  }, [])

  const Com = useValue<FC<ModalBodyProps> | undefined>(
    async () => toggle.opened ? context.modal().layer()?.Com : undefined,
    [toggle.opened]
  )

  return <Dialog open={toggle.opened} onOpenChange={toggle.set}>
    {Com != null ? <Com modal={context.modal()} /> : undefined}
  </Dialog>
}
```

A **body is an `FC<ModalBodyProps>`** — it receives the service as an optional `modal` prop, and
that prop is how it answers. Nothing else reaches it, so whatever a body needs travels in the
closure of the component that requested it.

```typescript
const result = await context.modal().request<Answer>(ConfirmBody)   // null when cancelled
```

`request` pushes the body onto the stack, opens the linked toggle, and resolves when the body calls
`modal.response(value)`, `modal.cancel()` (which resolves `null`) or `modal.error(e)` (which
rejects). All three settle the promise first, then pop the layer and close the surface — and
`request` pops a SECOND time when its own `await` resumes. One completed request therefore removes
two layers.

**Keep the stack one deep.** A lone body ends on an empty stack and the second pop costs nothing.
A body requested from inside another body takes its parent down with it: closing the child pops the
child, sees a layer still there and schedules the surface to reopen 500 ms later, and then the
child's continuation pops the parent in the microtask before that timer fires. The surface reopens
with `layer()` answering `undefined` and nothing to render, and the parent's own `request` — whose
deferred no one is left to settle — never resolves. Chain from the caller instead: await the first
request, then issue the next.
