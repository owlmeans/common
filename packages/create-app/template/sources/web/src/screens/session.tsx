import { useEffect, useState, type FC } from 'react'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { useStoreList } from '@owlmeans/client'
import { session, type SessionItem } from '__APP_SLUG__-common'
import { SESSION_STATE, useContext } from '../context.js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const SID_KEY = '__APP_SLUG__-sid'

const sessionId = (): string => {
  let sid = localStorage.getItem(SID_KEY)
  if (sid == null) {
    sid = crypto.randomUUID()
    localStorage.setItem(SID_KEY, sid)
  }
  return sid
}

export const SessionScreen: FC = () => {
  const ctx = useContext()
  const sid = sessionId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const store = ctx.getStateResource<SessionItem>(SESSION_STATE)

  /**
   * The list is a live subscription to the state resource, not a piece of component state.
   * Anything that writes a record — this screen or another one — re-renders it, so adding and
   * removing never re-fetch to stay in step. `{}` matches every record; a real filter goes here.
   */
  const items = useStoreList<SessionItem>({ query: {}, resource: SESSION_STATE })

  // The server is the source of truth; the store is what the screen reads. Fetch once, write
  // what came back into the store, and let the subscription render it.
  const load = async () => {
    const [data] = await ctx
      .entrypoint<ClientEntrypoint<SessionItem[]>>(session.list)
      .call({ params: { sid } })
    for (const item of data ?? []) {
      await store.save(item)
    }
  }

  useEffect(() => { void load() }, [])

  const add = async () => {
    if (text.trim() === '') return
    setBusy(true)
    try {
      const [item] = await ctx
        .entrypoint<ClientEntrypoint<SessionItem>>(session.add)
        .call({ params: { sid }, body: { text } })
      setText('')
      if (item != null) {
        await store.save(item)
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await ctx
      .entrypoint<ClientEntrypoint<{ removed: boolean }>>(session.remove)
      .call({ params: { sid, id } })
    await store.delete(id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session items</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Stored in memory on the API, keyed by your session id <code>{sid.slice(0, 8)}…</code>
        </p>
        <div className="mb-4 flex gap-2">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add an item…"
            onKeyDown={e => { if (e.key === 'Enter') void add() }}
          />
          <Button onClick={() => void add()} disabled={busy}>Add</Button>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li
              key={item.record.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span>{item.record.text}</span>
              <Button variant="ghost" size="sm" onClick={() => void remove(item.record.id)}>
                Remove
              </Button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-sm text-muted-foreground">No items yet — add one above.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
